const path = require('path-extra');
const gulp = require('gulp');
const fs = require('fs-extra');
const rollup = require('rollup-stream');
const source = require('vinyl-source-stream');
const resolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');
const replace = require('rollup-plugin-replace');
const multiEntry = require('rollup-plugin-multi-entry');
const oneLine = require('common-tags').oneLine;

const constants = require('./utils/constants');
const packageRunnner = require('./utils/package-runner');
const logHelper = require('./utils/log-helper');
const pkgPathToName = require('./utils/pkg-path-to-name');

const buildTestBundle = (packagePath, runningEnv, nodeEnv) => {
  const testPath = path.posix.join(packagePath, 'test');
  const environmentPath = path.posix.join(testPath, 'bundle', runningEnv);

  // First check if the bundle directory exists, if it doesn't
  // there is nothing to build (NOTE: Rollup + multientry will
  // always create a file, even if the directory doesn't exist)
  if (!fs.pathExistsSync(environmentPath)) {
    return Promise.resolve();
  }

  logHelper.log(oneLine`
    Building Test Bundle for ${logHelper.highlight(pkgPathToName(packagePath))}
    to run in '${logHelper.highlight(runningEnv)}'
    with NODE_ENV='${logHelper.highlight(nodeEnv)}'.
  `);

  const plugins = [
    // Resolve allows bundled tests to pull in node modules like chai.
    resolve(),
    // CommonJS allows the loaded modules to work as ES2015 imports.
    commonjs({
      namedExports: {
        'node_modules/chai/index.js': ['expect'],
      },
    }),
    // Multi entry globs for multiple files. Used to pull in all test files.
    multiEntry(),
  ];

  let outputFilename = `${runningEnv}.js`;

  if (nodeEnv) {
    // Make a unique bundle file for this environment
    outputFilename = path.fileNameWithPostfix(outputFilename, `.${nodeEnv}`);
    // Replace allows us to input NODE_ENV and strip code accordingly
    plugins.push(replace({
      'process.env.NODE_ENV': JSON.stringify(nodeEnv),
    }));
  }

  return rollup({
    entry: path.posix.join(environmentPath, '**', '*.js'),
    format: 'iife',
    moduleName: 'workbox.tests',
    sourceMap: 'inline',
    plugins,
    onwarn: (warning) => {
      if (warning.code === 'UNRESOLVED_IMPORT') {
        logHelper.error(`Unable to resolve import. `, warning.message);
        throw new Error(`Unable to resolve import. ${warning.message}`);
      }

      logHelper.warn(`Rollup Warning:`, warning);
    },
  })
  // This gives the generated stream a file name
  .pipe(source(outputFilename))
  .pipe(gulp.dest(
    path.posix.join(testPath, constants.BUNDLE_BUILD_DIRNAME, runningEnv)
  ));
};

const cleanBundleFile = (packagePath) => {
  logHelper.log(oneLine`
    Cleaning Test Bundles for
    ${logHelper.highlight(pkgPathToName(packagePath))}.
  `);

  const testPath = path.posix.join(packagePath, 'test');
  const outputDirectory = path.posix.join(
    testPath, constants.BUNDLE_BUILD_DIRNAME);
  return fs.remove(outputDirectory);
};

gulp.task('test:build-bundles:clean',
  gulp.series(packageRunnner(cleanBundleFile))
);

gulp.task('test:build-bundles:build',
  gulp.parallel(
    packageRunnner(buildTestBundle, 'browser'),
    packageRunnner(buildTestBundle, 'browser', 'production'),
    packageRunnner(buildTestBundle, 'node'),
    packageRunnner(buildTestBundle, 'node', 'production'),
    packageRunnner(buildTestBundle, 'sw'),
    packageRunnner(buildTestBundle, 'sw', 'production'),
  )
);

gulp.task('test:build-bundles', gulp.series(
  'test:build-bundles:clean',
  'test:build-bundles:build',
));
