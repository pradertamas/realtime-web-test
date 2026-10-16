# Local QR dependencies

- jsQR 1.4.0: QR decoding fallback, Apache-2.0; jsqr-LICENSE.txt.
- qrcode-generator 2.0.4: QR generation, MIT; qrcode-generator-LICENSE.txt.

Original browser distributions are checked in unmodified. PROVENANCE.json records
the npm package tarball URLs, verified npm integrity and extracted JS SHA-256.
The generator license was retrieved from the upstream repository LICENSE:
https://github.com/kazuhikoarase/qrcode-generator/blob/master/LICENSE

Scripts are loaded locally, not from a runtime CDN. Keep source/license/provenance
files together in the release. Neither package accesses the camera or uploads
data; qr-tools.js owns local camera lifecycle and invokes the decoder.
