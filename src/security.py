import gzip

# Secret key matching the C# Revit Add-in exactly
ENCRYPTION_KEY = b"LGSF_Framing_Engine_Secret_2026!"

def rc4_cipher(data: bytes, key: bytes) -> bytes:
    """Standard RC4 stream cipher implementation."""
    s = list(range(256))
    j = 0
    
    # Key-scheduling algorithm (KSA)
    for i in range(256):
        j = (j + s[i] + key[i % len(key)]) % 256
        s[i], s[j] = s[j], s[i]
        
    # Pseudo-random generation algorithm (PRGA)
    i = j = 0
    out = bytearray()
    for byte in data:
        i = (i + 1) % 256
        j = (j + s[i]) % 256
        s[i], s[j] = s[j], s[i]
        t = (s[i] + s[j]) % 256
        out.append(byte ^ s[t])
        
    return bytes(out)

def encrypt_data(plain_text: str) -> bytes:
    """Compresses a string with GZip, then encrypts with RC4."""
    compressed = gzip.compress(plain_text.encode('utf-8'))
    return rc4_cipher(compressed, ENCRYPTION_KEY)

def decrypt_data(cipher_bytes: bytes) -> str:
    """Decrypts bytes with RC4, then decompresses with GZip."""
    decrypted = rc4_cipher(cipher_bytes, ENCRYPTION_KEY)
    decompressed = gzip.decompress(decrypted)
    return decompressed.decode('utf-8')
