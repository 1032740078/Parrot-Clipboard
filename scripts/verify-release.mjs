import fs from "node:fs";
import path from "node:path";

const root = globalThis.process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const packageJson = JSON.parse(read("package.json"));
const tauriConfig = JSON.parse(read("src-tauri/tauri.conf.json"));
const cargoToml = read("src-tauri/Cargo.toml");
const ciWorkflow = read(".github/workflows/ci.yml");
const releaseWorkflow = read(".github/workflows/release.yml");
const releaseDoc = read("docs/v1.0/发布清单与回滚说明.md");

const errors = [];
const warnings = [];

const cargoVersionMatch = cargoToml.match(/^version = "([^"]+)"$/m);
const cargoNameMatch = cargoToml.match(/^name = "([^"]+)"$/m);
const cargoDescriptionMatch = cargoToml.match(/^description = "([^"]+)"$/m);

if (!cargoVersionMatch) {
  errors.push("无法从 src-tauri/Cargo.toml 读取版本号。");
}
if (!cargoNameMatch) {
  errors.push("无法从 src-tauri/Cargo.toml 读取包名。");
}
if (!cargoDescriptionMatch) {
  errors.push("无法从 src-tauri/Cargo.toml 读取描述信息。");
}

const cargoVersion = cargoVersionMatch?.[1] ?? "";
const cargoName = cargoNameMatch?.[1] ?? "";
const cargoDescription = cargoDescriptionMatch?.[1] ?? "";

if (packageJson.version !== cargoVersion) {
  errors.push(`package.json 与 Cargo.toml 版本不一致：${packageJson.version} !== ${cargoVersion}`);
}

if (tauriConfig.version !== "../package.json") {
  errors.push('src-tauri/tauri.conf.json 应使用 "../package.json" 作为版本源。');
}

if (tauriConfig.productName === "tauri-app") {
  errors.push("productName 仍是模板默认值 tauri-app。");
}

if (cargoName === "tauri-app") {
  errors.push("Cargo 包名仍是模板默认值 tauri-app。");
}

if (cargoDescription === "A Tauri App") {
  errors.push("Cargo 描述仍是模板默认值 A Tauri App。");
}

if (!tauriConfig.bundle?.active) {
  errors.push("Tauri bundle.active 必须为 true。");
}

if (!tauriConfig.app?.security?.assetProtocol?.enable) {
  errors.push("Tauri assetProtocol 必须启用，否则图片预览无法通过 convertFileSrc 加载。");
}

const assetProtocolScope = Array.isArray(tauriConfig.app?.security?.assetProtocol?.scope)
  ? tauriConfig.app.security.assetProtocol.scope
  : [];

if (
  !assetProtocolScope.some((scope) => typeof scope === "string" && scope.includes("$APPDATA/images/"))
) {
  errors.push("Tauri assetProtocol scope 必须覆盖 $APPDATA/images/**。");
}

if (
  !assetProtocolScope.some(
    (scope) => typeof scope === "string" && scope.includes("$APPLOCALDATA/images/")
  )
) {
  warnings.push("建议 Tauri assetProtocol scope 同时覆盖 $APPLOCALDATA/images/**，确保不同平台目录映射稳定。");
}

const windowsSignCommand = tauriConfig.bundle?.windows?.signCommand;
if (!(typeof windowsSignCommand === "string" ? windowsSignCommand : windowsSignCommand?.script)) {
  errors.push("缺少 Windows 自定义签名命令配置。");
}

for (const requiredScript of ["scripts/sign-windows.ps1", "scripts/package-macos-dmg.sh"]) {
  if (!exists(requiredScript)) {
    errors.push(`缺少 ${requiredScript}。`);
  }
}

for (const scriptName of ["release:verify-config", "release:check", "release:build:local"]) {
  if (!packageJson.scripts?.[scriptName]) {
    errors.push(`缺少 package.json 脚本：${scriptName}`);
  }
}

for (const expectedText of [
  "push:",
  "tags:",
  '"v*"',
  "pnpm tauri build --bundles",
  "gh release create",
  "WINDOWS_CERTIFICATE",
  "APPLE_CERTIFICATE",
  "package-macos-dmg.sh",
]) {
  if (!releaseWorkflow.includes(expectedText)) {
    errors.push(`release workflow 缺少关键片段：${expectedText}`);
  }
}

for (const expectedText of [
  "发布前检查清单",
  "回滚说明",
  "SHA256",
  "WINDOWS_CERTIFICATE",
  "APPLE_CERTIFICATE",
  "package-macos-dmg.sh",
]) {
  if (!releaseDoc.includes(expectedText)) {
    errors.push(`发布文档缺少关键内容：${expectedText}`);
  }
}

if (!releaseWorkflow.includes("ubuntu-22.04")) {
  warnings.push("release workflow 未显式固定 ubuntu-22.04，建议保持 Linux 构建环境稳定。");
}

if (!ciWorkflow.includes("--no-sign")) {
  warnings.push("未检测到 CI 使用 --no-sign 的跨平台打包冒烟构建。");
}

if (errors.length > 0) {
  globalThis.console.error("发布配置校验失败：");
  for (const error of errors) {
    globalThis.console.error(`- ${error}`);
  }
  if (warnings.length > 0) {
    globalThis.console.error("附加提示：");
    for (const warning of warnings) {
      globalThis.console.error(`- ${warning}`);
    }
  }
  globalThis.process.exit(1);
}

globalThis.console.log("发布配置校验通过：");
globalThis.console.log(`- 版本号：${packageJson.version}`);
globalThis.console.log(`- Cargo 包名：${cargoName}`);
globalThis.console.log(`- 产品名：${tauriConfig.productName}`);
globalThis.console.log(`- Windows 签名脚本：${typeof windowsSignCommand === "string" ? windowsSignCommand : windowsSignCommand.script}`);
globalThis.console.log("- 发布工作流、发布清单与回滚文档已就绪");

if (warnings.length > 0) {
  globalThis.console.log("补充提示：");
  for (const warning of warnings) {
    globalThis.console.log(`- ${warning}`);
  }
}
