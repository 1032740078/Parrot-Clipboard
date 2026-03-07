param(
  [Parameter(Mandatory = $true)]
  [string]$TargetPath
)

$ErrorActionPreference = 'Stop'

function Resolve-SignToolPath {
  $command = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Filter signtool.exe -Recurse -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending

  if (-not $candidates -or $candidates.Count -eq 0) {
    throw '未找到 signtool.exe，请确认 Windows SDK 已安装。'
  }

  return $candidates[0].FullName
}

if (-not (Test-Path -LiteralPath $TargetPath)) {
  throw "待签名文件不存在：$TargetPath"
}

$thumbprint = $env:WINDOWS_CERTIFICATE_THUMBPRINT
if ([string]::IsNullOrWhiteSpace($thumbprint)) {
  throw '缺少 WINDOWS_CERTIFICATE_THUMBPRINT，无法执行 Windows 代码签名。'
}

$digestAlgorithm = if ([string]::IsNullOrWhiteSpace($env:WINDOWS_SIGN_DIGEST_ALGORITHM)) {
  'sha256'
} else {
  $env:WINDOWS_SIGN_DIGEST_ALGORITHM
}

$timestampUrl = if ([string]::IsNullOrWhiteSpace($env:WINDOWS_TIMESTAMP_URL)) {
  'http://timestamp.digicert.com'
} else {
  $env:WINDOWS_TIMESTAMP_URL
}

$useTsp = $env:WINDOWS_TIMESTAMP_TSP -eq 'true'
$signTool = Resolve-SignToolPath
$args = @('sign', '/sha1', $thumbprint, '/fd', $digestAlgorithm)

if ($useTsp) {
  $args += @('/tr', $timestampUrl, '/td', $digestAlgorithm)
} else {
  $args += @('/t', $timestampUrl)
}

$args += $TargetPath

Write-Host "使用 signtool 对文件签名：$TargetPath"
& $signTool @args

if ($LASTEXITCODE -ne 0) {
  throw "signtool 执行失败，退出码：$LASTEXITCODE"
}
