# Signs the built APK with your own key, so it installs over the existing app.
# A small window asks for the passwords (they're in signing-key-info.txt, in the same zip as the
# key), and tells you how it went. The key is unpacked only for this and deleted straight after.
#
#   powershell -ExecutionPolicy Bypass -File android\sign.ps1
param(
    [string]$Zip = "$env:USERPROFILE\Downloads\Steadyset - Google Play package.zip",
    [string]$Out = "$PSScriptRoot\..\public\steadyset-beta.apk"
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.Windows.Forms.Application]::EnableVisualStyles()

function Show-Message([string]$Text, [string]$Icon) {
    $owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }
    [void][System.Windows.Forms.MessageBox]::Show($owner, $Text, "Sign Steadyset", "OK", $Icon)
    $owner.Dispose()
}

function Ask-Passwords {
    $form = New-Object System.Windows.Forms.Form -Property @{
        Text = "Sign Steadyset"; FormBorderStyle = "FixedDialog"; MaximizeBox = $false; MinimizeBox = $false
        StartPosition = "CenterScreen"; TopMost = $true; ClientSize = New-Object System.Drawing.Size(430, 230)
    }
    $intro = New-Object System.Windows.Forms.Label -Property @{
        Text = "Paste the two passwords from signing-key-info.txt (it's in the zip in your Downloads folder). If it only lists one, paste it in both."
        Location = New-Object System.Drawing.Point(16, 14); Size = New-Object System.Drawing.Size(398, 44)
    }
    $storeLabel = New-Object System.Windows.Forms.Label -Property @{ Text = "Key store password"; Location = New-Object System.Drawing.Point(16, 66); AutoSize = $true }
    $store = New-Object System.Windows.Forms.TextBox -Property @{ UseSystemPasswordChar = $true; Location = New-Object System.Drawing.Point(16, 86); Width = 398 }
    $keyLabel = New-Object System.Windows.Forms.Label -Property @{ Text = "Key password"; Location = New-Object System.Drawing.Point(16, 120); AutoSize = $true }
    $key = New-Object System.Windows.Forms.TextBox -Property @{ UseSystemPasswordChar = $true; Location = New-Object System.Drawing.Point(16, 140); Width = 398 }
    $ok = New-Object System.Windows.Forms.Button -Property @{ Text = "Sign"; DialogResult = "OK"; Location = New-Object System.Drawing.Point(254, 186); Width = 76; Height = 28 }
    $cancel = New-Object System.Windows.Forms.Button -Property @{ Text = "Cancel"; DialogResult = "Cancel"; Location = New-Object System.Drawing.Point(338, 186); Width = 76; Height = 28 }
    $form.Controls.AddRange(@($intro, $storeLabel, $store, $keyLabel, $key, $ok, $cancel))
    $form.AcceptButton = $ok
    $form.CancelButton = $cancel
    $form.Add_Shown({ $form.Activate(); [void]$store.Focus() })
    $result = $form.ShowDialog()
    $answer = if ($result -eq [System.Windows.Forms.DialogResult]::OK) { @{ Store = $store.Text; Key = $key.Text } } else { $null }
    $form.Dispose()
    return $answer
}

$env:JAVA_HOME = "$env:USERPROFILE\.jdks\temurin-17"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$apksigner = "$env:USERPROFILE\.android-sdk\build-tools\34.0.0\apksigner.bat"
$unsigned = "$PSScriptRoot\build\steadyset-unsigned.apk"
if (-not (Test-Path $unsigned)) { throw "Build it first: bash android/build.sh" }
if (-not (Test-Path -LiteralPath $Zip)) { throw "Couldn't find the key's zip at $Zip. Pass its location with -Zip." }

# a copy left behind if an earlier run was closed part-way
Get-ChildItem $env:TEMP -Filter "steadyset-sign-*" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force

$tmp = Join-Path $env:TEMP ("steadyset-sign-" + [guid]::NewGuid())
try {
    # only the key comes out of the zip, not the file holding its passwords
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $archive = [System.IO.Compression.ZipFile]::OpenRead($Zip)
    try {
        $entry = $archive.Entries | Where-Object { $_.Name -eq "signing.keystore" } | Select-Object -First 1
        if (-not $entry) { throw "There's no signing.keystore in $Zip." }
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, "$tmp\signing.keystore")
    }
    finally {
        $archive.Dispose()
    }

    while ($true) {
        Write-Host "Waiting for the passwords in the Sign Steadyset window..."
        $answer = Ask-Passwords
        if (-not $answer) {
            Write-Host "Cancelled. Nothing was signed."
            break
        }
        if (-not $answer.Store) {
            Show-Message "The key store password was empty. Paste it and try again." "Warning"
            continue
        }
        $env:STEADYSET_KS_PASS = $answer.Store
        $env:STEADYSET_KEY_PASS = if ($answer.Key) { $answer.Key } else { $answer.Store }
        Write-Host "Signing..."
        # apksigner reports problems on stderr, which isn't a reason to stop here
        $ErrorActionPreference = "Continue"
        $output = & $apksigner sign --ks "$tmp\signing.keystore" --ks-pass env:STEADYSET_KS_PASS --key-pass env:STEADYSET_KEY_PASS --v4-signing-enabled false --out $Out $unsigned 2>&1 | Out-String
        $failed = $LASTEXITCODE -ne 0
        $ErrorActionPreference = "Stop"
        if (-not $failed) {
            Write-Host "Signed: $Out"
            Show-Message "Signed. You can go back to the chat and press Signed it, push." "Information"
            break
        }
        Write-Host "Signing failed: $($output.Trim())"
        Show-Message "That didn't work, most likely a password that isn't quite right. Check both and try again.`n`n$($output.Trim())" "Warning"
    }
}
finally {
    Remove-Item Env:\STEADYSET_KS_PASS -ErrorAction SilentlyContinue
    Remove-Item Env:\STEADYSET_KEY_PASS -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
}
