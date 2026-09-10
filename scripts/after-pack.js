const path = require("path");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const { rcedit } = await import("rcedit");
  const executablePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`
  );
  const iconPath = path.join(
    context.packager.projectDir,
    "build",
    "icon.ico"
  );

  await rcedit(executablePath, {
    icon: iconPath,
    "file-version": context.packager.appInfo.buildVersion,
    "product-version": context.packager.appInfo.buildVersion
  });
};
