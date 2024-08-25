import QRCode from "qrcode";
import Jimp from "jimp";
import path from "path";

const DEFAULT_LOGO_PATH = path.resolve(
  __dirname,
  "..",
  "assets",
  "img",
  "logo.png"
);

export const generateQRCodeWithLogo = async ({
  url,
  logoPath = DEFAULT_LOGO_PATH,
}: {
  url: string;
  logoPath?: string;
}): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    QRCode.toBuffer(
      url,
      {
        errorCorrectionLevel: "H",
        margin: 1,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
        type: "png",
        width: 500,
      },
      async (err, buffer) => {
        if (err) reject(err);

        try {
          const qrImage = await Jimp.read(buffer);
          const logo = await Jimp.read(logoPath);

          const logoSize = qrImage.bitmap.width * 0.2;
          logo.resize(logoSize, logoSize, Jimp.RESIZE_BICUBIC);

          const background = new Jimp(
            logo.bitmap.width + 20,
            logo.bitmap.height + 20,
            0xffffffff
          );
          background.composite(logo, 10, 10);

          const x = (qrImage.bitmap.width - background.bitmap.width) / 2;
          const y = (qrImage.bitmap.height - background.bitmap.height) / 2;

          qrImage.composite(background, x, y, {
            mode: Jimp.BLEND_SOURCE_OVER,
            opacitySource: 1,
            opacityDest: 1,
          });

          const resultBuffer = await qrImage.getBufferAsync(Jimp.MIME_PNG);
          resolve(resultBuffer);
        } catch (error) {
          reject(error);
        }
      }
    );
  });
};
