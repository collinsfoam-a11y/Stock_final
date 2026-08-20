[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [Parameter()]
    [string]$SharePath = 'D:\stk_deploy',

    [Parameter()]
    [string]$ShareName = 'StockAppDeploy',

    [Parameter(Mandatory = $false)]
    [string]$DeploymentUser = 'noufal\noufal',

    [Parameter()]
    [switch]$EnableFirewallRule
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        throw 'Run this script in an elevated PowerShell window as Administrator.'
    }
}

function Resolve-AccountSid([string]$AccountName) {
    try {
        $ntAccount = [Security.Principal.NTAccount]::new($AccountName)
        return $ntAccount.Translate([Security.Principal.SecurityIdentifier]).Value
    }
    catch {
        throw "Deployment account '$AccountName' could not be resolved. Confirm the local/domain account and use DOMAIN\\USER syntax where required."
    }
}

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        if ($PSCmdlet.ShouldProcess($Path, 'Create deployment directory')) {
            New-Item -ItemType Directory -Path $Path -Force | Out-Null
        }
    }
}

function Ensure-NtfsAccess([string]$Path, [string]$AccountName) {
    $acl = Get-Acl -LiteralPath $Path
    $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
    $propagation = [System.Security.AccessControl.PropagationFlags]::None
    $rights = [System.Security.AccessControl.FileSystemRights]::Modify
    $type = [System.Security.AccessControl.AccessControlType]::Allow
    $desired = [System.Security.AccessControl.FileSystemAccessRule]::new($AccountName, $rights, $inheritance, $propagation, $type)

    $alreadyPresent = $acl.Access | Where-Object {
        $_.IdentityReference.Value -eq $AccountName -and
        $_.AccessControlType -eq $type -and
        (($_.FileSystemRights -band $rights) -eq $rights)
    }

    if (-not $alreadyPresent) {
        if ($PSCmdlet.ShouldProcess($Path, "Grant NTFS Modify access to $AccountName")) {
            $acl.AddAccessRule($desired)
            Set-Acl -LiteralPath $Path -AclObject $acl
        }
    }
}

function Ensure-SmbShare([string]$Path, [string]$Name, [string]$AccountName) {
    $share = Get-SmbShare -Name $Name -ErrorAction SilentlyContinue
    if (-not $share) {
        if ($PSCmdlet.ShouldProcess($Name, "Create SMB share for $Path")) {
            New-SmbShare -Name $Name -Path $Path -ChangeAccess $AccountName -Description 'Stock App release transfer; least-privilege deployment share' | Out-Null
        }
    }
    else {
        if ($share.Path -ne $Path) {
            throw "Existing SMB share '$Name' points to '$($share.Path)', not '$Path'. Refusing to modify it."
        }
        $shareAccess = Get-SmbShareAccess -Name $Name
        $hasChange = $shareAccess | Where-Object {
            $_.AccountName -eq $AccountName -and
            $_.AccessControlType -eq 'Allow' -and
            (($_.AccessRight -eq 'Change') -or ($_.AccessRight -eq 'Full'))
        }
        if (-not $hasChange) {
            if ($PSCmdlet.ShouldProcess($Name, "Grant SMB Change access to $AccountName")) {
                Grant-SmbShareAccess -Name $Name -AccountName $AccountName -AccessRight Change -Force | Out-Null
            }
        }
    }
}

function Ensure-Firewall([switch]$Enable) {
    $inbound = Get-NetFirewallRule -DisplayGroup 'File and Printer Sharing' -ErrorAction SilentlyContinue |
        Where-Object { $_.Direction -eq 'Inbound' -and $_.Enabled -eq 'True' -and $_.Action -eq 'Allow' }
    if (-not $inbound) {
        if (-not $Enable) {
            Write-Warning 'No enabled inbound File and Printer Sharing allow rule was found. Re-run with -EnableFirewallRule only after firewall change approval.'
            return
        }
        if ($PSCmdlet.ShouldProcess('File and Printer Sharing firewall group', 'Enable inbound SMB firewall rules')) {
            Enable-NetFirewallRule -DisplayGroup 'File and Printer Sharing'
        }
    }
}

Assert-Administrator
$accountSid = Resolve-AccountSid -AccountName $DeploymentUser
Write-Host "Resolved deployment account SID: $accountSid"
Write-Host "Share path: $SharePath"
Write-Host "Share name: $ShareName"

Ensure-Directory -Path $SharePath
Ensure-NtfsAccess -Path $SharePath -AccountName $DeploymentUser
Ensure-SmbShare -Path $SharePath -Name $ShareName -AccountName $DeploymentUser
Ensure-Firewall -Enable:$EnableFirewallRule

Write-Host ''
Write-Host 'Verification:'
Get-SmbShare -Name $ShareName | Select-Object Name, Path, Description
Get-SmbShareAccess -Name $ShareName | Where-Object AccountName -eq $DeploymentUser | Select-Object AccountName, AccessControlType, AccessRight
Get-Acl -LiteralPath $SharePath | Select-Object -ExpandProperty Access | Where-Object IdentityReference -eq $DeploymentUser | Select-Object IdentityReference, FileSystemRights, AccessControlType, IsInherited
Write-Host ''
Write-Host 'Setup complete. This script does not create secrets, start Docker, run SQL, run MongoDB commands, or execute migrations.'
