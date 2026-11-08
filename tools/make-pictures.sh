#!/bin/zsh
# Makes the web copies of the pictures wall's photos.
#
#   tools/make-pictures.sh photos-src/IMG_1234.HEIC hermitage-cliff [photos-src/IMG_1240.HEIC pinnacle ...]
#
# Each original (HEIC, JPEG, PNG …) becomes images/pictures/<name>.avif: converted to sRGB, 1600px on its long side,
# AV1-compressed, with every bit of metadata (GPS location, camera, date) stripped. The originals stay in photos-src/,
# which git ignores. Prints each result's size and ratio, for the `shape` in js/pictures.js.
set -euo pipefail

LONG=1600       # px on the long side: the wall's biggest frame is ~600 css px, ~1200 device px on a retina screen
CRF=38          # AV1 quality: lower is better and bigger
OUT=images/pictures
SRGB="/System/Library/ColorSync/Profiles/sRGB Profile.icc"

cd "$(dirname "$0")/.."
mkdir -p "$OUT"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

while (( $# >= 2 )); do
  src=$1 name=$2
  shift 2
  sips -s format png -m "$SRGB" -Z $LONG "$src" --out "$tmp/$name.png" >/dev/null
  SVT_LOG=1 ffmpeg -loglevel error -y -i "$tmp/$name.png" -map_metadata -1 \
    -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -pix_fmt yuv420p \
    -c:v libsvtav1 -crf $CRF -preset 4 -frames:v 1 "$OUT/$name.avif"
  w=$(sips -g pixelWidth "$OUT/$name.avif" | awk '/pixelWidth/{print $2}')
  h=$(sips -g pixelHeight "$OUT/$name.avif" | awk '/pixelHeight/{print $2}')
  kb=$(( $(stat -f %z "$OUT/$name.avif") / 1024 ))
  gps=$(sips -g all "$OUT/$name.avif" | grep -ci gps || true)
  printf '%-28s %5sx%-5s ratio %.2f  %4s KB  gps tags: %s\n' "$name.avif" "$w" "$h" $(( w * 1.0 / h )) "$kb" "$gps"
done
