# FellowMage (pacote): instala o servidor XMage a partir do pacote oficial publicado em xmage.today.
# Usado pelo atualizador do pacote (atualizacao.ps1) e pelo empacotamento (scripts\empacotar.ps1).
#
# O zip oficial (~250 MB) traz o cliente Swing e o servidor; so precisamos do servidor (~95 MB) e dos
# decks de exemplo. Quando o site aceita HTTP Range, o zip e lido direto da rede e so as entradas
# usadas sao baixadas; senao, baixa o zip inteiro.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$XmageConfigUrl = 'https://xmage.today/config.json'

if (-not ('FellowMage.HttpRangeStream' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Net;

namespace FellowMage {
    // Stream somente leitura sobre um arquivo remoto, lido em blocos com HTTP Range.
    public class HttpRangeStream : Stream {
        const int Chunk = 4 * 1024 * 1024;
        readonly string url;
        readonly long length;
        long pos;
        byte[] buf = new byte[0];
        long bufStart = -1;
        public long Downloaded;

        public HttpRangeStream(string url) {
            this.url = url;
            HttpWebRequest req = Create(url);
            req.Method = "HEAD";
            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse()) {
                if (resp.Headers["Accept-Ranges"] != "bytes") throw new NotSupportedException("servidor sem suporte a Range");
                length = resp.ContentLength;
            }
        }

        static HttpWebRequest Create(string url) {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.UserAgent = "FellowMage";
            req.Timeout = 30000;
            req.ReadWriteTimeout = 60000;
            return req;
        }

        void Fill(long start) {
            long end = Math.Min(start + Chunk, length) - 1;
            HttpWebRequest req = Create(url);
            req.AddRange(start, end);
            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse()) {
                if (resp.StatusCode != HttpStatusCode.PartialContent) throw new IOException("resposta sem Range: " + resp.StatusCode);
                byte[] data = new byte[end - start + 1];
                int read = 0;
                using (Stream s = resp.GetResponseStream()) {
                    while (read < data.Length) {
                        int n = s.Read(data, read, data.Length - read);
                        if (n <= 0) throw new IOException("download interrompido");
                        read += n;
                    }
                }
                buf = data;
                bufStart = start;
                Downloaded += data.Length;
            }
        }

        public override int Read(byte[] buffer, int offset, int count) {
            if (pos >= length || count == 0) return 0;
            if (bufStart < 0 || pos < bufStart || pos >= bufStart + buf.Length) Fill(pos);
            int n = (int)Math.Min(count, bufStart + buf.Length - pos);
            Array.Copy(buf, pos - bufStart, buffer, offset, n);
            pos += n;
            return n;
        }

        public override long Seek(long offset, SeekOrigin origin) {
            if (origin == SeekOrigin.Begin) pos = offset;
            else if (origin == SeekOrigin.Current) pos += offset;
            else pos = length + offset;
            return pos;
        }

        public override bool CanRead { get { return true; } }
        public override bool CanSeek { get { return true; } }
        public override bool CanWrite { get { return false; } }
        public override long Length { get { return length; } }
        public override long Position { get { return pos; } set { pos = value; } }
        public override void Flush() { }
        public override void SetLength(long value) { throw new NotSupportedException(); }
        public override void Write(byte[] buffer, int offset, int count) { throw new NotSupportedException(); }
    }
}
'@
}

# Versao publicada do XMage: Label (ex.: "1.4.63-dev (2026-11-17 18-06)"), Numero ("1.4.63") e Url do zip.
function Get-XmageOficial([int]$TimeoutMs = 5000) {
    $req = [Net.WebRequest]::Create($XmageConfigUrl)
    $req.Timeout = $TimeoutMs
    $req.UserAgent = 'FellowMage'
    $resp = $req.GetResponse()
    try { $json = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd() } finally { $resp.Close() }
    $cfg = $json | ConvertFrom-Json
    $label = [string]$cfg.XMage.version
    if ($label -notmatch '^(\d+\.\d+\.\d+)') { throw "Versao do XMage em formato inesperado: '$label'" }
    [pscustomobject]@{ Label = $label; Numero = $Matches[1]; Url = [string]$cfg.XMage.location }
}

# Numero da versao do servidor instalado em <pasta>\lib (ex.: "1.4.63"), ou $null.
function Get-XmageNumeroInstalado([string]$ServerDir) {
    $jar = Get-ChildItem (Join-Path $ServerDir 'lib') -Filter 'mage-server-*.jar' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($jar -and $jar.Name -match '^mage-server-(\d+\.\d+\.\d+)') { $Matches[1] } else { $null }
}

function Get-XmageLabelInstalado([string]$ServerDir) {
    $f = Join-Path $ServerDir 'xmage-versao.txt'
    if (Test-Path $f) { (Get-Content $f -Raw).Trim() } else { '' }
}

# Abre o zip oficial. Devolve @{ Zip; Stream; Temp } (feche com Close-XmageZip).
function Open-XmageZip([string]$Url, [string]$TempDir) {
    try {
        $stream = New-Object FellowMage.HttpRangeStream($Url)
        return @{ Zip = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Read); Stream = $stream; Temp = $null }
    } catch {
        # sem Range: baixa tudo
        New-Item -ItemType Directory -Force $TempDir | Out-Null
        $file = Join-Path $TempDir 'xmage.zip'
        Write-Host '  Baixando o pacote completo do XMage (o site nao permite baixar so o servidor)...' -ForegroundColor DarkGray
        $wc = New-Object Net.WebClient
        $wc.Headers['User-Agent'] = 'FellowMage'
        try { $wc.DownloadFile($Url, $file) } finally { $wc.Dispose() }
        return @{ Zip = [IO.Compression.ZipFile]::OpenRead($file); Stream = $null; Temp = $file }
    }
}

function Close-XmageZip($z) {
    if ($z.Zip) { $z.Zip.Dispose() }
    if ($z.Stream) { $z.Stream.Dispose() }
    if ($z.Temp) { Remove-Item $z.Temp -Force -ErrorAction SilentlyContinue }
}

# Entradas do zip oficial que o FellowMage usa, com o caminho de destino relativo.
function Get-XmageEntradas($Zip) {
    foreach ($e in $Zip.Entries) {
        if ($e.FullName.EndsWith('/')) { continue }
        if ($e.FullName -match '^mage-server/(.+)$') {
            $rel = $Matches[1]
            if ($rel -match '^startServer') { continue }
            [pscustomobject]@{ Entry = $e; Destino = "server/$rel" }
        } elseif ($e.FullName -match '^mage-client/sample-decks/(.+)$') {
            [pscustomobject]@{ Entry = $e; Destino = "sample-decks/$($Matches[1])" }
        }
    }
}

function Get-XmageTamanhoMB($Zip) {
    $bytes = (Get-XmageEntradas $Zip | ForEach-Object { $_.Entry.CompressedLength } | Measure-Object -Sum).Sum
    [math]::Ceiling($bytes / 1MB)
}

# Extrai server\ e sample-decks\ em $Destino, ajusta o config.xml e grava server\xmage-versao.txt.
function Expand-XmageServidor($Zip, [string]$Destino, [string]$Label, $Stream) {
    $entradas = @(Get-XmageEntradas $Zip)
    $total = ($entradas | ForEach-Object { $_.Entry.CompressedLength } | Measure-Object -Sum).Sum
    $feito = 0
    $mostrado = -1
    foreach ($x in $entradas) {
        $path = Join-Path $Destino ($x.Destino -replace '/', '\')
        New-Item -ItemType Directory -Force (Split-Path -Parent $path) | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($x.Entry, $path, $true)
        $feito += $x.Entry.CompressedLength
        # a cada 10%
        $pct = [int][math]::Floor(10 * $feito / [math]::Max($total, 1)) * 10
        if ($pct -ne $mostrado) {
            $mostrado = $pct
            Write-Host ("`r  Baixando o XMage... {0}% de {1} MB   " -f $pct, [int]($total / 1MB)) -NoNewline
        }
    }
    Write-Host ''
    $server = Join-Path $Destino 'server'
    if (-not (Get-XmageNumeroInstalado $server)) { throw 'O pacote do XMage nao tem o servidor (lib\mage-server-*.jar).' }
    # so local: escutar em 127.0.0.1 (evita o aviso do firewall do Windows)
    $cfg = Join-Path $server 'config\config.xml'
    $utf8 = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($cfg, ([IO.File]::ReadAllText($cfg) -replace 'serverAddress="0\.0\.0\.0"', 'serverAddress="127.0.0.1"'), $utf8)
    [IO.File]::WriteAllText((Join-Path $server 'xmage-versao.txt'), $Label, $utf8)
}
