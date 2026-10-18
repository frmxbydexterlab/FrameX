using System;
using System.IO;
using System.IO.Compression;
using System.Text;

namespace LGSFRevitAddin.Core
{
    public static class SecurityHelper
    {
        // 32-character key for RC4. Keep it exactly the same as Python backend.
        private static readonly byte[] EncryptionKey = Encoding.UTF8.GetBytes("LGSF_Framing_Engine_Secret_2026!");

        /// <summary>
        /// Encrypts and compresses a JSON string into a binary payload.
        /// </summary>
        public static byte[] EncryptAndCompress(string plainText)
        {
            // 1. Compress JSON string using GZip
            byte[] rawBytes = Encoding.UTF8.GetBytes(plainText);
            byte[] compressedBytes;
            using (var memoryStream = new MemoryStream())
            {
                using (var gzipStream = new GZipStream(memoryStream, CompressionMode.Compress))
                {
                    gzipStream.Write(rawBytes, 0, rawBytes.Length);
                }
                compressedBytes = memoryStream.ToArray();
            }

            // 2. Encrypt the compressed bytes using RC4
            return Rc4Cipher(compressedBytes, EncryptionKey);
        }

        /// <summary>
        /// Decrypts and decompresses a binary payload into a JSON string.
        /// </summary>
        public static string DecryptAndDecompress(byte[] cipherBytes)
        {
            // 1. Decrypt using RC4
            byte[] decompressedBytes = Rc4Cipher(cipherBytes, EncryptionKey);

            // 2. Decompress using GZip
            using (var memoryStream = new MemoryStream(decompressedBytes))
            using (var gzipStream = new GZipStream(memoryStream, CompressionMode.Decompress))
            using (var reader = new StreamReader(gzipStream, Encoding.UTF8))
            {
                return reader.ReadToEnd();
            }
        }

        /// <summary>
        /// Standard, clean RC4 stream cipher implementation.
        /// </summary>
        private static byte[] Rc4Cipher(byte[] data, byte[] key)
        {
            int[] s = new int[256];
            for (int i = 0; i < 256; i++)
            {
                s[i] = i;
            }

            int j = 0;
            for (int i = 0; i < 256; i++)
            {
                j = (j + s[i] + key[i % key.Length]) % 256;
                int temp = s[i];
                s[i] = s[j];
                s[j] = temp;
            }

            int x = 0;
            int y = 0;
            byte[] result = new byte[data.Length];
            for (int i = 0; i < data.Length; i++)
            {
                x = (x + 1) % 256;
                y = (y + s[x]) % 256;
                int temp = s[x];
                s[x] = s[y];
                s[y] = temp;
                int t = (s[x] + s[y]) % 256;
                result[i] = (byte)(data[i] ^ s[t]);
            }

            return result;
        }
    }
}
