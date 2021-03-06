import execa from "execa";
import fs from "fs";
import path from "path";
import readline from "readline";

(async () => {
  const read = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  read.on("close", () => console.log("Press Ctrl+C again to exit..."));

  const rootDir = path.join(__dirname, "..", "..");
  await execa("npm", ["run", "buildTsSchemaLoader"], {
    stdio: "inherit",
    cwd: rootDir
  });

  // Start the webpack dev for the frontend.
  execa("npm", ["run", "liveWebpackFrontend"], {
    stdio: "inherit",
    cwd: path.join(rootDir, "frontend")
  });

  // Start the webpack dev for the functions.
  const functionsDir = path.join(rootDir, "functions");
  execa("npm", ["run", "liveWebpackFunctions"], {
    stdio: "inherit",
    cwd: functionsDir
  });

  // Firebase emulator will fail if dist/main.js does not exist, so write an empty file.
  const workerJsPath = path.join(functionsDir, "dist", "main.js");
  await fs.promises.writeFile(workerJsPath, "0");

  // Start the Firebase emulation.
  execa("npm", ["run", "liveFirebaseEmulator"], {
    stdio: "inherit",
    cwd: functionsDir
  });


  // Start the webpack dev for the tests.
  const testDir = path.join(rootDir, "test");
  execa("npm", ["run", "liveWebpackTest"], {
    stdio: "inherit",
    cwd: testDir
  });

  const testJsPath = path.join(testDir, "dist", "main.js");

  // Wait until webpack compiles the tests.
  for (;;) {
    if (fs.existsSync(testJsPath)) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  process.env.NODE_PATH = path.join(testDir, "node_modules");
  // eslint-disable-next-line no-underscore-dangle
  require("module").Module._initPaths();

  for (let i = 0; ; ++i) {
    await new Promise((resolve) => read.question("Press enter to run the test...\n", resolve));

    process.env.TEST_RUN_NUMBER = String(i);
    // eslint-disable-next-line no-eval
    eval(await fs.promises.readFile(testJsPath, "utf8"));
  }
})();
