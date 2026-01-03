# Windows Commands PowerShell Module
# Provides Windows alternatives for Unix commands used in the OpenCode build process

using namespace System.IO

# Export functions for use in other scripts
Export-ModuleMember -Function @(
    'Find-Files', 
    'Set-Permissions', 
    'New-SymLink', 
    'Copy-Files', 
    'Search-Text', 
    'Replace-Text',
    'Set-Writable',
    'ConvertTo-UnixPath',
    'ConvertTo-WindowsPath',
    'New-Directory',
    'Remove-File',
    'Get-FileInfo',
    'Set-FileMode'
)

<#
.SYNOPSIS
    Find files and directories (Windows alternative to Unix find command)
.DESCRIPTION
    Recursively finds files and directories matching specified criteria.
    Supports filtering by name, extension, and file attributes.
.PARAMETER Path
    Starting directory path
.PARAMETER Filter
    File name filter (supports wildcards)
.PARAMETER FileType
    Type: 'File', 'Directory', or 'All'
.PARAMETER MaxDepth
    Maximum recursion depth
.EXAMPLE
    Find-Files -Path "." -Filter "*.js" -FileType File
#>
function Find-Files {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,
        
        [Parameter(Mandatory=$false)]
        [string]$Filter = "*",
        
        [Parameter(Mandatory=$false)]
        [ValidateSet('File', 'Directory', 'All')]
        [string]$FileType = 'All',
        
        [Parameter(Mandatory=$false)]
        [int]$MaxDepth = -1
    )
    
    $currentDepth = 0
    
    function Get-ItemsRecursive {
        param(
            [string]$CurrentPath,
            [int]$CurrentDepth,
            [int]$MaxDepth
        )
        
        if ($MaxDepth -gt 0 -and $CurrentDepth -ge $MaxDepth) {
            return
        }
        
        try {
            $items = Get-ChildItem -Path $CurrentPath -ErrorAction SilentlyContinue
            
            foreach ($item in $items) {
                $continueRecursion = $item.PSIsContainer
                
                # Filter by file type
                if ($FileType -eq 'File' -and -not $item.PSIsContainer) {
                    if ($item.Name -like $Filter) {
                        Write-Output $item.FullName
                    }
                }
                elseif ($FileType -eq 'Directory' -and $item.PSIsContainer) {
                    if ($item.Name -like $Filter) {
                        Write-Output $item.FullName
                    }
                }
                elseif ($FileType -eq 'All' -and $item.Name -like $Filter) {
                    Write-Output $item.FullName
                }
                
                # Recurse into directories
                if ($continueRecursion) {
                    Get-ItemsRecursive -CurrentPath $item.FullName -CurrentDepth ($CurrentDepth + 1) -MaxDepth $MaxDepth
                }
            }
        }
        catch {
            Write-Warning "Could not access path: $CurrentPath - $_"
        }
    }
    
    Get-ItemsRecursive -CurrentPath $Path -CurrentDepth $currentDepth -MaxDepth $MaxDepth
}

<#
.SYNOPSIS
    Set file permissions (Windows alternative to Unix chmod)
.DESCRIPTION
    Sets file permissions using Windows ACLs. Supports various permission levels.
.PARAMETER Path
    File or directory path
.PARAMETER Permission
    Permission level: 'Read', 'Write', 'Execute', 'FullControl'
.PARAMETER User
    User or group name (default: Everyone)
.PARAMETER Recursive
    Apply recursively to subdirectories
.EXAMPLE
    Set-Permissions -Path "script.sh" -Permission "Execute"
#>
function Set-Permissions {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,
        
        [Parameter(Mandatory=$false)]
        [ValidateSet('Read', 'Write', 'Execute', 'FullControl')]
        [string]$Permission = 'FullControl',
        
        [Parameter(Mandatory=$false)]
        [string]$User = "Everyone",
        
        [Parameter(Mandatory=$false)]
        [switch]$Recursive
    )
    
    try {
        $permissionMap = @{
            'Read' = 'ReadAndExecute'
            'Write' = 'Modify'
            'Execute' = 'ReadAndExecute'
            'FullControl' = 'FullControl'
        }
        
        $ntfsPermission = $permissionMap[$Permission]
        
        if ($Recursive) {
            & icacls $Path /grant "$User`:$ntfsPermission" /T /C /Q | Out-Null
        } else {
            & icacls $Path /grant "$User`:$ntfsPermission" /C /Q | Out-Null
        }
        
        Write-Verbose "Set $Permission permissions for $Path"
    }
    catch {
        Write-Warning "Could not set permissions for $Path : $_"
    }
}

<#
.SYNOPSIS
    Create symbolic link or junction (Windows alternative to Unix ln)
.DESCRIPTION
    Creates symbolic links or directory junctions on Windows.
.PARAMETER Target
    Target path (what the link points to)
.PARAMETER LinkPath
    Path where the link should be created
.PARAMETER Type
    Type of link: 'Symbolic' or 'Junction'
.EXAMPLE
    New-SymLink -Target "C:\source\file.txt" -LinkPath "C:\link\file.txt" -Type Symbolic
#>
function New-SymLink {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$Target,
        
        [Parameter(Mandatory=$true)]
        [string]$LinkPath,
        
        [Parameter(Mandatory=$false)]
        [ValidateSet('Symbolic', 'Junction')]
        [string]$Type = 'Symbolic'
    )
    
    try {
        # Remove existing link if it exists
        if (Test-Path $LinkPath) {
            if ((Get-Item $LinkPath).LinkType) {
                Remove-Item -Path $LinkPath -Force
            }
        }
        
        # Create parent directory if it doesn't exist
        $parentDir = Split-Path $LinkPath -Parent
        if (-not (Test-Path $parentDir)) {
            New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
        }
        
        # Create the link
        if ($Type -eq 'Junction') {
            & cmd /c "mklink /J `"$LinkPath`" `"$Target`"" | Out-Null
        } else {
            & cmd /c "mklink `"$LinkPath`" `"$Target`"" | Out-Null
        }
        
        Write-Verbose "Created $Type link: $LinkPath -> $Target"
    }
    catch {
        Write-Warning "Could not create symlink: $_"
    }
}

<#
.SYNOPSIS
    Copy files and directories (Windows alternative to Unix cp)
.DESCRIPTION
    Copies files and directories with options for overwriting and recursion.
.PARAMETER Source
    Source file or directory
.PARAMETER Destination
    Destination path
.PARAMETER Force
    Overwrite existing files without prompting
.PARAMETER Recursive
    Copy directories recursively
.PARAMETER PreserveAttributes
    Preserve file attributes
.EXAMPLE
    Copy-Files -Source "src\*" -Destination "dest\" -Recursive -Force
#>
function Copy-Files {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$Source,
        
        [Parameter(Mandatory=$true)]
        [string]$Destination,
        
        [Parameter(Mandatory=$false)]
        [switch]$Force,
        
        [Parameter(Mandatory=$false)]
        [switch]$Recursive,
        
        [Parameter(Mandatory=$false)]
        [switch]$PreserveAttributes
    )
    
    try {
        # Ensure destination directory exists
        $destDir = Split-Path $Destination -Parent
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        
        # Handle wildcard patterns
        $sourcePath = if ($Source -match '[\*\?]') {
            (Get-Item $Source).FullName
        } else {
            $Source
        }
        
        $copyParams = @{
            Path = $sourcePath
            Destination = $Destination
        }
        
        if ($Force) { $copyParams.Force = $true }
        if ($Recursive) { $copyParams.Recurse = $true }
        
        Copy-Item @copyParams
        
        if ($PreserveAttributes) {
            Get-ChildItem -Path $Destination -Recurse | ForEach-Object {
                $_.Attributes = $_.Attributes -bor [FileAttributes]::Archive
            }
        }
        
        Write-Verbose "Copied $Source to $Destination"
    }
    catch {
        Write-Warning "Could not copy files: $_"
    }
}

<#
.SYNOPSIS
    Search text in files (Windows alternative to Unix grep)
.DESCRIPTION
    Searches for text patterns in files using Select-String.
.PARAMETER Pattern
    Text pattern or regular expression to search for
.PARAMETER Path
    Path to search in (file or directory)
.PARAMETER Filter
    File filter (e.g., "*.txt", "*.js")
.PARAMETER CaseSensitive
    Use case-sensitive matching
.PARAMETER SimpleMatch
    Use simple text matching instead of regex
.EXAMPLE
    Search-Text -Pattern "TODO" -Path "." -Filter "*.ts" -SimpleMatch
#>
function Search-Text {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$Pattern,
        
        [Parameter(Mandatory=$false)]
        [string]$Path = ".",
        
        [Parameter(Mandatory=$false)]
        [string]$Filter = "*",
        
        [Parameter(Mandatory=$false)]
        [switch]$CaseSensitive,
        
        [Parameter(Mandatory=$false)]
        [switch]$SimpleMatch
    )
    
    try {
        $searchParams = @{
            Path = $Path
            Pattern = $Pattern
        }
        
        if ($Filter -ne "*") {
            $searchParams.Include = $Filter
        }
        
        if (-not $CaseSensitive) {
            $searchParams.AllMatches = $true
        }
        
        if ($SimpleMatch) {
            $searchParams.SimpleMatch = $true
        }
        
        Select-String @searchParams
    }
    catch {
        Write-Warning "Error during text search: $_"
    }
}

<#
.SYNOPSIS
    Replace text in files (Windows alternative to Unix sed)
.DESCRIPTION
    Replaces text patterns in files using PowerShell's replace operator.
.PARAMETER Path
    File or directory path
.PARAMETER Pattern
    Text pattern to find (supports regex)
.PARAMETER Replacement
    Text to replace with
.PARAMETER Filter
    File filter (e.g., "*.txt")
.PARAMETER CaseSensitive
    Use case-sensitive matching
.EXAMPLE
    Replace-Text -Path "*.js" -Pattern "oldText" -Replacement "newText" -Filter "*.js"
#>
function Replace-Text {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,
        
        [Parameter(Mandatory=$true)]
        [string]$Pattern,
        
        [Parameter(Mandatory=$true)]
        [string]$Replacement,
        
        [Parameter(Mandatory=$false)]
        [string]$Filter = "*",
        
        [Parameter(Mandatory=$false)]
        [switch]$CaseSensitive
    )
    
    try {
        # Find files to process
        $filesToProcess = if (Test-Path $Path -PathType Leaf) {
            @($Path)
        } else {
            Find-Files -Path $Path -Filter $Filter -FileType File
        }
        
        foreach ($file in $filesToProcess) {
            $content = Get-Content -Path $file -Raw -ErrorAction SilentlyContinue
            if ($content) {
                if ($CaseSensitive) {
                    $newContent = $content -creplace $Pattern, $Replacement
                } else {
                    $newContent = $content -replace $Pattern, $Replacement
                }
                
                if ($newContent -ne $content) {
                    Set-Content -Path $file -Value $newContent -NoNewline -ErrorAction SilentlyContinue
                    Write-Verbose "Updated: $file"
                }
            }
        }
    }
    catch {
        Write-Warning "Error during text replacement: $_"
    }
}

<#
.SYNOPSIS
    Set files as writable (Windows alternative to chmod u+w)
.DESCRIPTION
    Makes files writable by removing read-only attribute.
.PARAMETER Path
    File or directory path
.PARAMETER Recursive
    Apply recursively to subdirectories
.EXAMPLE
    Set-Writable -Path "dist\*" -Recursive
#>
function Set-Writable {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,
        
        [Parameter(Mandatory=$false)]
        [switch]$Recursive
    )
    
    try {
        $items = if ($Recursive) {
            Get-ChildItem -Path $Path -Recurse -ErrorAction SilentlyContinue
        } else {
            Get-ChildItem -Path $Path -ErrorAction SilentlyContinue
        }
        
        foreach ($item in $items) {
            if ($item.PSIsContainer) {
                # Directory: remove read-only and system attributes
                $item.Attributes = $item.Attributes -band (-bnot [FileAttributes]::ReadOnly) -band (-bnot [FileAttributes]::System)
            } else {
                # File: remove read-only attribute
                $item.Attributes = $item.Attributes -band (-bnot [FileAttributes]::ReadOnly)
            }
        }
        
        Write-Verbose "Set writable permissions for $Path"
    }
    catch {
        Write-Warning "Could not set writable permissions: $_"
    }
}

<#
.SYNOPSIS
    Convert Windows path to Unix-style path
.DESCRIPTION
    Converts Windows paths to Unix format for cross-platform compatibility.
.PARAMETER Path
    Windows path to convert
.EXAMPLE
    ConvertTo-UnixPath -Path "C:\Users\file.txt"
#>
function ConvertTo-UnixPath {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Path)
    
    # Convert backslashes to forward slashes and handle drive letters
    $unixPath = $Path -replace '\\', '/'
    $unixPath = $unixPath -replace '([A-Za-z]):', '/$1'
    
    return $unixPath
}

<#
.SYNOPSIS
    Convert Unix path to Windows-style path
.DESCRIPTION
    Converts Unix-style paths to Windows format.
.PARAMETER Path
    Unix path to convert
.EXAMPLE
    ConvertTo-WindowsPath -Path "/c/Users/file.txt"
#>
function ConvertTo-WindowsPath {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Path)
    
    # Convert forward slashes to backslashes and handle drive letters
    $windowsPath = $Path -replace '/', '\'
    $windowsPath = $windowsPath -replace '/([A-Za-z])', '$1:'
    
    return $windowsPath
}

<#
.SYNOPSIS
    Create directory with parents (Windows alternative to mkdir -p)
.DESCRIPTION
    Creates directories and all parent directories if they don't exist.
.PARAMETER Path
    Directory path to create
.EXAMPLE
    New-Directory -Path "C:\path\to\deep\directory"
#>
function New-Directory {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Path)
    
    try {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
        Write-Verbose "Created directory: $Path"
    }
    catch {
        Write-Warning "Could not create directory $Path : $_"
    }
}

<#
.SYNOPSIS
    Remove files and directories (Windows alternative to rm)
.DESCRIPTION
    Removes files and directories, with options for force and recursion.
.PARAMETER Path
    Path to remove
.PARAMETER Force
    Force removal without prompting
.PARAMETER Recursive
    Remove directories and contents recursively
.EXAMPLE
    Remove-File -Path "temp\*" -Recursive -Force
#>
function Remove-File {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [Parameter(Mandatory=$false)][switch]$Force,
        [Parameter(Mandatory=$false)][switch]$Recursive
    )
    
    try {
        $removeParams = @{
            Path = $Path
        }
        
        if ($Force) { $removeParams.Force = $true }
        if ($Recursive) { $removeParams.Recurse = $true }
        
        Remove-Item @removeParams
        Write-Verbose "Removed: $Path"
    }
    catch {
        Write-Warning "Could not remove $Path : $_"
    }
}

<#
.SYNOPSIS
    Get file information (Windows alternative to Unix stat)
.DESCRIPTION
    Returns detailed information about files and directories.
.PARAMETER Path
    File or directory path
.EXAMPLE
    Get-FileInfo -Path "script.sh"
#>
function Get-FileInfo {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][string]$Path)
    
    try {
        if (Test-Path $Path) {
            $item = Get-Item $Path
            return @{
                Name = $item.Name
                FullName = $item.FullName
                Size = $item.Length
                Created = $item.CreationTime
                Modified = $item.LastWriteTime
                IsDirectory = $item.PSIsContainer
                Attributes = $item.Attributes.ToString()
            }
        } else {
            Write-Warning "Path not found: $Path"
        }
    }
    catch {
        Write-Warning "Could not get file info for $Path : $_"
    }
}

<#
.SYNOPSIS
    Set file mode/attributes (Windows alternative to chmod)
.DESCRIPTION
    Sets specific file attributes and permissions.
.PARAMETER Path
    File or directory path
.PARAMETER Mode
    Mode string (e.g., "755", "644")
.PARAMETER Attributes
    File attributes to set
.EXAMPLE
    Set-FileMode -Path "script.sh" -Attributes "Archive,NotContentIndexed"
#>
function Set-FileMode {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [Parameter(Mandatory=$false)][string]$Mode,
        [Parameter(Mandatory=$false)][string]$Attributes
    )
    
    try {
        if (Test-Path $Path) {
            $item = Get-Item $Path
            
            if ($Mode) {
                # Map Unix modes to Windows attributes
                switch ($Mode) {
                    "755" { $item.Attributes = $item.Attributes -bor [FileAttributes]::Archive }
                    "644" { $item.Attributes = $item.Attributes -band (-bnot [FileAttributes]::ReadOnly) }
                    default { $item.Attributes = $item.Attributes -bor [FileAttributes]::Archive }
                }
            }
            
            if ($Attributes) {
                $attrMap = @{
                    'Archive' = [FileAttributes]::Archive
                    'ReadOnly' = [FileAttributes]::ReadOnly
                    'Hidden' = [FileAttributes]::Hidden
                    'System' = [FileAttributes]::System
                }
                
                foreach ($attr in $Attributes.Split(',').Trim()) {
                    if ($attrMap.ContainsKey($attr)) {
                        $item.Attributes = $item.Attributes -bor $attrMap[$attr]
                    }
                }
            }
            
            Write-Verbose "Set mode for $Path"
        }
    }
    catch {
        Write-Warning "Could not set file mode for $Path : $_"
    }
}