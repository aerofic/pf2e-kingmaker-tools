[CmdletBinding()]
param(
    [ValidateNotNullOrEmpty()]
    [string] $ExpectedVersion,

    [ValidateNotNullOrEmpty()]
    [string] $OutputDirectory = "release"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$moduleRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$manifestPath = Join-Path $moduleRoot "module.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$moduleId = [string] $manifest.id
$version = [string] $manifest.version

if ([string]::IsNullOrWhiteSpace($moduleId) -or $moduleId -notmatch "^[a-z0-9][a-z0-9-]*$") {
    throw "module.json contains an invalid module id: '$moduleId'."
}

if ([string]::IsNullOrWhiteSpace($version)) {
    throw "module.json does not contain a version."
}

if ($ExpectedVersion -and $ExpectedVersion -ne $version) {
    throw "Release tag '$ExpectedVersion' does not match module.json version '$version'."
}

$repositoryUrl = "https://github.com/aerofic/pf2e-kingmaker-tools"
$expectedManifestUrl = "$repositoryUrl/releases/latest/download/module.json"
$expectedDownloadUrl = "$repositoryUrl/releases/download/$version/release.zip"

$expectedMetadata = [ordered]@{
    url = $repositoryUrl
    manifest = $expectedManifestUrl
    download = $expectedDownloadUrl
}

foreach ($propertyName in $expectedMetadata.Keys) {
    $actualValue = [string] $manifest.$propertyName
    $expectedValue = [string] $expectedMetadata[$propertyName]
    if ($actualValue -ne $expectedValue) {
        throw "module.json '$propertyName' must be '$expectedValue', but is '$actualValue'."
    }
}

$releaseEntries = @(
    "module.json",
    "LICENSE",
    "OpenGameLicense.md",
    "README.md",
    "CHANGELOG.md",
    "token-map.json",
    "art",
    "dist",
    "docs",
    "img",
    "packs"
)

foreach ($relativePath in $releaseEntries) {
    $sourcePath = Join-Path $moduleRoot $relativePath
    if (-not (Test-Path -LiteralPath $sourcePath)) {
        throw "Required release entry is missing: $relativePath"
    }
}

$manifestFiles = [Collections.Generic.List[string]]::new()
foreach ($propertyName in @("scripts", "esmodules")) {
    $property = $manifest.PSObject.Properties[$propertyName]
    if ($null -eq $property) {
        continue
    }
    foreach ($scriptPath in @($property.Value)) {
        $manifestFiles.Add([string] $scriptPath)
    }
}
foreach ($style in @($manifest.styles)) {
    $stylePath = if ($style -is [string]) { $style } else { $style.src }
    $manifestFiles.Add([string] $stylePath)
}
foreach ($language in @($manifest.languages)) {
    $manifestFiles.Add([string] $language.path)
}

$rootPrefix = $moduleRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
foreach ($relativePath in $manifestFiles) {
    $assetPath = [IO.Path]::GetFullPath((Join-Path $moduleRoot $relativePath))
    if (-not $assetPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Manifest asset escapes the module root: $relativePath"
    }
    if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
        throw "Manifest asset is missing: $relativePath"
    }
}

foreach ($pack in @($manifest.packs)) {
    $packPath = [IO.Path]::GetFullPath((Join-Path $moduleRoot ([string] $pack.path)))
    if (-not $packPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Pack path escapes the module root: $($pack.path)"
    }
    if (-not (Test-Path -LiteralPath $packPath -PathType Container)) {
        throw "Manifest pack is missing: $($pack.path)"
    }
}

$resolvedOutputDirectory = if ([IO.Path]::IsPathRooted($OutputDirectory)) {
    [IO.Path]::GetFullPath($OutputDirectory)
} else {
    [IO.Path]::GetFullPath((Join-Path $moduleRoot $OutputDirectory))
}

New-Item -ItemType Directory -Path $resolvedOutputDirectory -Force | Out-Null
$archivePath = Join-Path $resolvedOutputDirectory "release.zip"
$stagingRoot = Join-Path ([IO.Path]::GetTempPath()) ("$moduleId-release-" + [guid]::NewGuid().ToString("N"))
$stagingModule = Join-Path $stagingRoot $moduleId

try {
    New-Item -ItemType Directory -Path $stagingModule -Force | Out-Null

    foreach ($relativePath in $releaseEntries) {
        Copy-Item -LiteralPath (Join-Path $moduleRoot $relativePath) -Destination $stagingModule -Recurse -Force
    }

    Compress-Archive -LiteralPath $stagingModule -DestinationPath $archivePath -CompressionLevel Optimal -Force

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
        $archiveEntries = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        foreach ($entry in $archive.Entries) {
            [void] $archiveEntries.Add($entry.FullName)
        }

        $requiredArchiveFiles = @("module.json") + $manifestFiles
        foreach ($relativePath in $requiredArchiveFiles) {
            $entryName = "$moduleId/$($relativePath.Replace('\', '/'))"
            if (-not $archiveEntries.Contains($entryName)) {
                throw "Release archive is missing manifest file: $entryName"
            }
        }

        foreach ($pack in @($manifest.packs)) {
            $packPrefix = "$moduleId/$(([string] $pack.path).Replace('\', '/').TrimEnd('/'))/"
            $hasPackFile = $false
            foreach ($entryName in $archiveEntries) {
                if ($entryName.StartsWith($packPrefix, [StringComparison]::OrdinalIgnoreCase) -and -not $entryName.EndsWith('/')) {
                    $hasPackFile = $true
                    break
                }
            }
            if (-not $hasPackFile) {
                throw "Release archive does not contain files for pack: $($pack.path)"
            }
        }
    } finally {
        $archive.Dispose()
    }

    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Output "Created $archivePath"
    Write-Output "Version $version"
    Write-Output "SHA256 $archiveHash"
} finally {
    if (Test-Path -LiteralPath $stagingRoot) {
        Remove-Item -LiteralPath $stagingRoot -Recurse -Force
    }
}
