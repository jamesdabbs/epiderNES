#!/usr/bin/env node
/* eslint-disable max-len, flowtype/require-valid-file-annotation, flowtype/require-return-type */
/* global packageInformationStores, $$BLACKLIST, $$SETUP_STATIC_TABLES */

// Used for the resolveUnqualified part of the resolution (ie resolving folder/index.js & file extensions)
// Deconstructed so that they aren't affected by any fs monkeypatching occuring later during the execution
const {statSync, lstatSync, readlinkSync, readFileSync, existsSync, realpathSync} = require('fs');

const Module = require('module');
const path = require('path');
const StringDecoder = require('string_decoder');

const $$BLACKLIST = null;
const ignorePattern = $$BLACKLIST ? new RegExp($$BLACKLIST) : null;

const pnpFile = path.resolve(__dirname, __filename);
const builtinModules = new Set(Module.builtinModules || Object.keys(process.binding('natives')));

const topLevelLocator = {name: null, reference: null};
const blacklistedLocator = {name: NaN, reference: NaN};

// Used for compatibility purposes - cf setupCompatibilityLayer
const patchedModules = new Map();
const fallbackLocators = [topLevelLocator];

// Matches backslashes of Windows paths
const backwardSlashRegExp = /\\/g;

// Matches if the path must point to a directory (ie ends with /)
const isDirRegExp = /\/$/;

// Matches if the path starts with a valid path qualifier (./, ../, /)
// eslint-disable-next-line no-unused-vars
const isStrictRegExp = /^\.{0,2}/;

// Splits a require request into its components, or return null if the request is a file path
const pathRegExp = /^(?![A-Za-z]:)(?!\.{0,2}(?:\/|$))((?:@[^\/]+\/)?[^\/]+)\/?(.*|)$/;

// Keep a reference around ("module" is a common name in this context, so better rename it to something more significant)
const pnpModule = module;

/**
 * Used to disable the resolution hooks (for when we want to fallback to the previous resolution - we then need
 * a way to "reset" the environment temporarily)
 */

let enableNativeHooks = true;

/**
 * Simple helper function that assign an error code to an error, so that it can more easily be caught and used
 * by third-parties.
 */

function makeError(code, message, data = {}) {
  const error = new Error(message);
  return Object.assign(error, {code, data});
}

/**
 * Ensures that the returned locator isn't a blacklisted one.
 *
 * Blacklisted packages are packages that cannot be used because their dependencies cannot be deduced. This only
 * happens with peer dependencies, which effectively have different sets of dependencies depending on their parents.
 *
 * In order to deambiguate those different sets of dependencies, the Yarn implementation of PnP will generate a
 * symlink for each combination of <package name>/<package version>/<dependent package> it will find, and will
 * blacklist the target of those symlinks. By doing this, we ensure that files loaded through a specific path
 * will always have the same set of dependencies, provided the symlinks are correctly preserved.
 *
 * Unfortunately, some tools do not preserve them, and when it happens PnP isn't able anymore to deduce the set of
 * dependencies based on the path of the file that makes the require calls. But since we've blacklisted those paths,
 * we're able to print a more helpful error message that points out that a third-party package is doing something
 * incompatible!
 */

// eslint-disable-next-line no-unused-vars
function blacklistCheck(locator) {
  if (locator === blacklistedLocator) {
    throw makeError(
      `BLACKLISTED`,
      [
        `A package has been resolved through a blacklisted path - this is usually caused by one of your tools calling`,
        `"realpath" on the return value of "require.resolve". Since the returned values use symlinks to disambiguate`,
        `peer dependencies, they must be passed untransformed to "require".`,
      ].join(` `)
    );
  }

  return locator;
}

let packageInformationStores = new Map([
["@glennsl/bs-json",
new Map([["5.0.4",
         {
           packageLocation: "/home/cons/.esy/source/i/glennsl__s__bs_json__5.0.4__eae7c80c/",
           packageDependencies: new Map([["@glennsl/bs-json", "5.0.4"]])}]])],
  ["@types/glob",
  new Map([["7.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/types__s__glob__7.2.0__718320bb/",
             packageDependencies: new Map([["@types/glob", "7.2.0"],
                                             ["@types/minimatch", "3.0.5"],
                                             ["@types/node", "17.0.33"]])}]])],
  ["@types/minimatch",
  new Map([["3.0.5",
           {
             packageLocation: "/home/cons/.esy/source/i/types__s__minimatch__3.0.5__156d484a/",
             packageDependencies: new Map([["@types/minimatch", "3.0.5"]])}]])],
  ["@types/node",
  new Map([["17.0.33",
           {
             packageLocation: "/home/cons/.esy/source/i/types__s__node__17.0.33__b5848ae5/",
             packageDependencies: new Map([["@types/node", "17.0.33"]])}]])],
  ["@webassemblyjs/ast",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__ast__1.9.0__d4cc025e/",
             packageDependencies: new Map([["@webassemblyjs/ast", "1.9.0"],
                                             ["@webassemblyjs/helper-module-context",
                                             "1.9.0"],
                                             ["@webassemblyjs/helper-wasm-bytecode",
                                             "1.9.0"],
                                             ["@webassemblyjs/wast-parser",
                                             "1.9.0"]])}]])],
  ["@webassemblyjs/floating-point-hex-parser",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__floating_point_hex_parser__1.9.0__934c6125/",
             packageDependencies: new Map([["@webassemblyjs/floating-point-hex-parser",
                                           "1.9.0"]])}]])],
  ["@webassemblyjs/helper-api-error",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__helper_api_error__1.9.0__e3bba3ef/",
             packageDependencies: new Map([["@webassemblyjs/helper-api-error",
                                           "1.9.0"]])}]])],
  ["@webassemblyjs/helper-buffer",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__helper_buffer__1.9.0__32a4feaa/",
             packageDependencies: new Map([["@webassemblyjs/helper-buffer",
                                           "1.9.0"]])}]])],
  ["@webassemblyjs/helper-code-frame",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__helper_code_frame__1.9.0__389a1573/",
             packageDependencies: new Map([["@webassemblyjs/helper-code-frame",
                                           "1.9.0"],
                                             ["@webassemblyjs/wast-printer",
                                             "1.9.0"]])}]])],
  ["@webassemblyjs/helper-fsm",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__helper_fsm__1.9.0__88273844/",
             packageDependencies: new Map([["@webassemblyjs/helper-fsm",
                                           "1.9.0"]])}]])],
  ["@webassemblyjs/helper-module-context",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__helper_module_context__1.9.0__d1eb90b9/",
             packageDependencies: new Map([["@webassemblyjs/ast", "1.9.0"],
                                             ["@webassemblyjs/helper-module-context",
                                             "1.9.0"]])}]])],
  ["@webassemblyjs/helper-wasm-bytecode",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__helper_wasm_bytecode__1.9.0__2506753a/",
             packageDependencies: new Map([["@webassemblyjs/helper-wasm-bytecode",
                                           "1.9.0"]])}]])],
  ["@webassemblyjs/helper-wasm-section",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__helper_wasm_section__1.9.0__9b161ce0/",
             packageDependencies: new Map([["@webassemblyjs/ast", "1.9.0"],
                                             ["@webassemblyjs/helper-buffer",
                                             "1.9.0"],
                                             ["@webassemblyjs/helper-wasm-bytecode",
                                             "1.9.0"],
                                             ["@webassemblyjs/helper-wasm-section",
                                             "1.9.0"],
                                             ["@webassemblyjs/wasm-gen",
                                             "1.9.0"]])}]])],
  ["@webassemblyjs/ieee754",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__ieee754__1.9.0__f54d7877/",
             packageDependencies: new Map([["@webassemblyjs/ieee754",
                                           "1.9.0"],
                                             ["@xtuc/ieee754", "1.2.0"]])}]])],
  ["@webassemblyjs/leb128",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__leb128__1.9.0__b0baffbb/",
             packageDependencies: new Map([["@webassemblyjs/leb128", "1.9.0"],
                                             ["@xtuc/long", "4.2.2"]])}]])],
  ["@webassemblyjs/utf8",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__utf8__1.9.0__3bdfc84a/",
             packageDependencies: new Map([["@webassemblyjs/utf8", "1.9.0"]])}]])],
  ["@webassemblyjs/wasm-edit",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__wasm_edit__1.9.0__c90fc51f/",
             packageDependencies: new Map([["@webassemblyjs/ast", "1.9.0"],
                                             ["@webassemblyjs/helper-buffer",
                                             "1.9.0"],
                                             ["@webassemblyjs/helper-wasm-bytecode",
                                             "1.9.0"],
                                             ["@webassemblyjs/helper-wasm-section",
                                             "1.9.0"],
                                             ["@webassemblyjs/wasm-edit",
                                             "1.9.0"],
                                             ["@webassemblyjs/wasm-gen",
                                             "1.9.0"],
                                             ["@webassemblyjs/wasm-opt",
                                             "1.9.0"],
                                             ["@webassemblyjs/wasm-parser",
                                             "1.9.0"],
                                             ["@webassemblyjs/wast-printer",
                                             "1.9.0"]])}]])],
  ["@webassemblyjs/wasm-gen",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__wasm_gen__1.9.0__fa6a932a/",
             packageDependencies: new Map([["@webassemblyjs/ast", "1.9.0"],
                                             ["@webassemblyjs/helper-wasm-bytecode",
                                             "1.9.0"],
                                             ["@webassemblyjs/ieee754",
                                             "1.9.0"],
                                             ["@webassemblyjs/leb128",
                                             "1.9.0"],
                                             ["@webassemblyjs/utf8", "1.9.0"],
                                             ["@webassemblyjs/wasm-gen",
                                             "1.9.0"]])}]])],
  ["@webassemblyjs/wasm-opt",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__wasm_opt__1.9.0__e7c65a73/",
             packageDependencies: new Map([["@webassemblyjs/ast", "1.9.0"],
                                             ["@webassemblyjs/helper-buffer",
                                             "1.9.0"],
                                             ["@webassemblyjs/wasm-gen",
                                             "1.9.0"],
                                             ["@webassemblyjs/wasm-opt",
                                             "1.9.0"],
                                             ["@webassemblyjs/wasm-parser",
                                             "1.9.0"]])}]])],
  ["@webassemblyjs/wasm-parser",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__wasm_parser__1.9.0__44b6ff45/",
             packageDependencies: new Map([["@webassemblyjs/ast", "1.9.0"],
                                             ["@webassemblyjs/helper-api-error",
                                             "1.9.0"],
                                             ["@webassemblyjs/helper-wasm-bytecode",
                                             "1.9.0"],
                                             ["@webassemblyjs/ieee754",
                                             "1.9.0"],
                                             ["@webassemblyjs/leb128",
                                             "1.9.0"],
                                             ["@webassemblyjs/utf8", "1.9.0"],
                                             ["@webassemblyjs/wasm-parser",
                                             "1.9.0"]])}]])],
  ["@webassemblyjs/wast-parser",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__wast_parser__1.9.0__8e567739/",
             packageDependencies: new Map([["@webassemblyjs/ast", "1.9.0"],
                                             ["@webassemblyjs/floating-point-hex-parser",
                                             "1.9.0"],
                                             ["@webassemblyjs/helper-api-error",
                                             "1.9.0"],
                                             ["@webassemblyjs/helper-code-frame",
                                             "1.9.0"],
                                             ["@webassemblyjs/helper-fsm",
                                             "1.9.0"],
                                             ["@webassemblyjs/wast-parser",
                                             "1.9.0"],
                                             ["@xtuc/long", "4.2.2"]])}]])],
  ["@webassemblyjs/wast-printer",
  new Map([["1.9.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webassemblyjs__s__wast_printer__1.9.0__be988078/",
             packageDependencies: new Map([["@webassemblyjs/ast", "1.9.0"],
                                             ["@webassemblyjs/wast-parser",
                                             "1.9.0"],
                                             ["@webassemblyjs/wast-printer",
                                             "1.9.0"],
                                             ["@xtuc/long", "4.2.2"]])}]])],
  ["@xtuc/ieee754",
  new Map([["1.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/xtuc__s__ieee754__1.2.0__2741d8fb/",
             packageDependencies: new Map([["@xtuc/ieee754", "1.2.0"]])}]])],
  ["@xtuc/long",
  new Map([["4.2.2",
           {
             packageLocation: "/home/cons/.esy/source/i/xtuc__s__long__4.2.2__1008afb9/",
             packageDependencies: new Map([["@xtuc/long", "4.2.2"]])}]])],
  ["accepts",
  new Map([["1.3.8",
           {
             packageLocation: "/home/cons/.esy/source/i/accepts__1.3.8__d279f1be/",
             packageDependencies: new Map([["accepts", "1.3.8"],
                                             ["mime-types", "2.1.35"],
                                             ["negotiator", "0.6.3"]])}]])],
  ["acorn",
  new Map([["6.4.2",
           {
             packageLocation: "/home/cons/.esy/source/i/acorn__6.4.2__3a5cdf52/",
             packageDependencies: new Map([["acorn", "6.4.2"]])}]])],
  ["ajv",
  new Map([["6.12.6",
           {
             packageLocation: "/home/cons/.esy/source/i/ajv__6.12.6__c3a69fc4/",
             packageDependencies: new Map([["ajv", "6.12.6"],
                                             ["fast-deep-equal", "3.1.3"],
                                             ["fast-json-stable-stringify",
                                             "2.1.0"],
                                             ["json-schema-traverse",
                                             "0.4.1"],
                                             ["uri-js", "4.4.1"]])}]])],
  ["ajv-errors",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/ajv_errors__1.0.1__a81cbb98/",
             packageDependencies: new Map([["ajv", "6.12.6"],
                                             ["ajv-errors", "1.0.1"]])}]])],
  ["ajv-keywords",
  new Map([["3.5.2",
           {
             packageLocation: "/home/cons/.esy/source/i/ajv_keywords__3.5.2__7394ed1b/",
             packageDependencies: new Map([["ajv", "6.12.6"],
                                             ["ajv-keywords", "3.5.2"]])}]])],
  ["ansi-colors",
  new Map([["3.2.4",
           {
             packageLocation: "/home/cons/.esy/source/i/ansi_colors__3.2.4__ba64f5b6/",
             packageDependencies: new Map([["ansi-colors", "3.2.4"]])}]])],
  ["ansi-html-community",
  new Map([["0.0.8",
           {
             packageLocation: "/home/cons/.esy/source/i/ansi_html_community__0.0.8__d3571f48/",
             packageDependencies: new Map([["ansi-html-community", "0.0.8"]])}]])],
  ["ansi-regex",
  new Map([["2.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/ansi_regex__2.1.1__f4873edb/",
             packageDependencies: new Map([["ansi-regex", "2.1.1"]])}],
             ["4.1.1",
             {
               packageLocation: "/home/cons/.esy/source/i/ansi_regex__4.1.1__69701333/",
               packageDependencies: new Map([["ansi-regex", "4.1.1"]])}]])],
  ["ansi-styles",
  new Map([["3.2.1",
           {
             packageLocation: "/home/cons/.esy/source/i/ansi_styles__3.2.1__3e3790a5/",
             packageDependencies: new Map([["ansi-styles", "3.2.1"],
                                             ["color-convert", "1.9.3"]])}]])],
  ["anymatch",
  new Map([["2.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/anymatch__2.0.0__53ff378a/",
             packageDependencies: new Map([["anymatch", "2.0.0"],
                                             ["micromatch", "3.1.10"],
                                             ["normalize-path", "2.1.1"]])}],
             ["3.1.2",
             {
               packageLocation: "/home/cons/.esy/source/i/anymatch__3.1.2__e27270e2/",
               packageDependencies: new Map([["anymatch", "3.1.2"],
                                               ["normalize-path", "3.0.0"],
                                               ["picomatch", "2.3.1"]])}]])],
  ["aproba",
  new Map([["1.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/aproba__1.2.0__8a61fac7/",
             packageDependencies: new Map([["aproba", "1.2.0"]])}]])],
  ["arr-diff",
  new Map([["4.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/arr_diff__4.0.0__5a7bbcc5/",
             packageDependencies: new Map([["arr-diff", "4.0.0"]])}]])],
  ["arr-flatten",
  new Map([["1.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/arr_flatten__1.1.0__15a968d1/",
             packageDependencies: new Map([["arr-flatten", "1.1.0"]])}]])],
  ["arr-union",
  new Map([["3.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/arr_union__3.1.0__58f07489/",
             packageDependencies: new Map([["arr-union", "3.1.0"]])}]])],
  ["array-flatten",
  new Map([["1.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/array_flatten__1.1.1__b411b848/",
             packageDependencies: new Map([["array-flatten", "1.1.1"]])}],
             ["2.1.2",
             {
               packageLocation: "/home/cons/.esy/source/i/array_flatten__2.1.2__a16f8552/",
               packageDependencies: new Map([["array-flatten", "2.1.2"]])}]])],
  ["array-union",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/array_union__1.0.2__09384b57/",
             packageDependencies: new Map([["array-union", "1.0.2"],
                                             ["array-uniq", "1.0.3"]])}]])],
  ["array-uniq",
  new Map([["1.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/array_uniq__1.0.3__9316bc48/",
             packageDependencies: new Map([["array-uniq", "1.0.3"]])}]])],
  ["array-unique",
  new Map([["0.3.2",
           {
             packageLocation: "/home/cons/.esy/source/i/array_unique__0.3.2__ace7cbf4/",
             packageDependencies: new Map([["array-unique", "0.3.2"]])}]])],
  ["asn1.js",
  new Map([["5.4.1",
           {
             packageLocation: "/home/cons/.esy/source/i/asn1.js__5.4.1__26af07e2/",
             packageDependencies: new Map([["asn1.js", "5.4.1"],
                                             ["bn.js", "4.12.0"],
                                             ["inherits", "2.0.4"],
                                             ["minimalistic-assert", "1.0.1"],
                                             ["safer-buffer", "2.1.2"]])}]])],
  ["assert",
  new Map([["1.5.0",
           {
             packageLocation: "/home/cons/.esy/source/i/assert__1.5.0__1fbf1db2/",
             packageDependencies: new Map([["assert", "1.5.0"],
                                             ["object-assign", "4.1.1"],
                                             ["util", "0.10.3"]])}]])],
  ["assign-symbols",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/assign_symbols__1.0.0__60f3deb0/",
             packageDependencies: new Map([["assign-symbols", "1.0.0"]])}]])],
  ["async",
  new Map([["2.6.4",
           {
             packageLocation: "/home/cons/.esy/source/i/async__2.6.4__d97e84f4/",
             packageDependencies: new Map([["async", "2.6.4"],
                                             ["lodash", "4.17.21"]])}]])],
  ["async-each",
  new Map([["1.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/async_each__1.0.3__6c87d26a/",
             packageDependencies: new Map([["async-each", "1.0.3"]])}]])],
  ["async-limiter",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/async_limiter__1.0.1__b0985680/",
             packageDependencies: new Map([["async-limiter", "1.0.1"]])}]])],
  ["atob",
  new Map([["2.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/atob__2.1.2__5aa0dbd4/",
             packageDependencies: new Map([["atob", "2.1.2"]])}]])],
  ["balanced-match",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/balanced_match__1.0.2__42d32da1/",
             packageDependencies: new Map([["balanced-match", "1.0.2"]])}]])],
  ["base",
  new Map([["0.11.2",
           {
             packageLocation: "/home/cons/.esy/source/i/base__0.11.2__30052a78/",
             packageDependencies: new Map([["base", "0.11.2"],
                                             ["cache-base", "1.0.1"],
                                             ["class-utils", "0.3.6"],
                                             ["component-emitter", "1.3.0"],
                                             ["define-property", "1.0.0"],
                                             ["isobject", "3.0.1"],
                                             ["mixin-deep", "1.3.2"],
                                             ["pascalcase", "0.1.1"]])}]])],
  ["base64-js",
  new Map([["1.5.1",
           {
             packageLocation: "/home/cons/.esy/source/i/base64_js__1.5.1__ebde91fb/",
             packageDependencies: new Map([["base64-js", "1.5.1"]])}]])],
  ["batch",
  new Map([["0.6.1",
           {
             packageLocation: "/home/cons/.esy/source/i/batch__0.6.1__45632b13/",
             packageDependencies: new Map([["batch", "0.6.1"]])}]])],
  ["big.js",
  new Map([["3.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/big.js__3.2.0__2998c7a6/",
             packageDependencies: new Map([["big.js", "3.2.0"]])}],
             ["5.2.2",
             {
               packageLocation: "/home/cons/.esy/source/i/big.js__5.2.2__8283cd4a/",
               packageDependencies: new Map([["big.js", "5.2.2"]])}]])],
  ["binary-extensions",
  new Map([["1.13.1",
           {
             packageLocation: "/home/cons/.esy/source/i/binary_extensions__1.13.1__97da917f/",
             packageDependencies: new Map([["binary-extensions", "1.13.1"]])}],
             ["2.2.0",
             {
               packageLocation: "/home/cons/.esy/source/i/binary_extensions__2.2.0__258dd606/",
               packageDependencies: new Map([["binary-extensions", "2.2.0"]])}]])],
  ["bindings",
  new Map([["1.5.0",
           {
             packageLocation: "/home/cons/.esy/source/i/bindings__1.5.0__3b0592d3/",
             packageDependencies: new Map([["bindings", "1.5.0"],
                                             ["file-uri-to-path", "1.0.0"]])}]])],
  ["bluebird",
  new Map([["3.7.2",
           {
             packageLocation: "/home/cons/.esy/source/i/bluebird__3.7.2__d7471652/",
             packageDependencies: new Map([["bluebird", "3.7.2"]])}]])],
  ["bn.js",
  new Map([["4.12.0",
           {
             packageLocation: "/home/cons/.esy/source/i/bn.js__4.12.0__8ba4195f/",
             packageDependencies: new Map([["bn.js", "4.12.0"]])}],
             ["5.2.0",
             {
               packageLocation: "/home/cons/.esy/source/i/bn.js__5.2.0__fa402c11/",
               packageDependencies: new Map([["bn.js", "5.2.0"]])}]])],
  ["body-parser",
  new Map([["1.20.0",
           {
             packageLocation: "/home/cons/.esy/source/i/body_parser__1.20.0__6120e04b/",
             packageDependencies: new Map([["body-parser", "1.20.0"],
                                             ["bytes", "3.1.2"],
                                             ["content-type", "1.0.4"],
                                             ["debug", "2.6.9"],
                                             ["depd", "2.0.0"],
                                             ["destroy", "1.2.0"],
                                             ["http-errors", "2.0.0"],
                                             ["iconv-lite", "0.4.24"],
                                             ["on-finished", "2.4.1"],
                                             ["qs", "6.10.3"],
                                             ["raw-body", "2.5.1"],
                                             ["type-is", "1.6.18"],
                                             ["unpipe", "1.0.0"]])}]])],
  ["bonjour",
  new Map([["3.5.0",
           {
             packageLocation: "/home/cons/.esy/source/i/bonjour__3.5.0__e3768e45/",
             packageDependencies: new Map([["array-flatten", "2.1.2"],
                                             ["bonjour", "3.5.0"],
                                             ["deep-equal", "1.1.1"],
                                             ["dns-equal", "1.0.0"],
                                             ["dns-txt", "2.0.2"],
                                             ["multicast-dns", "6.2.3"],
                                             ["multicast-dns-service-types",
                                             "1.1.0"]])}]])],
  ["boolbase",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/boolbase__1.0.0__3cc1700f/",
             packageDependencies: new Map([["boolbase", "1.0.0"]])}]])],
  ["brace-expansion",
  new Map([["1.1.11",
           {
             packageLocation: "/home/cons/.esy/source/i/brace_expansion__1.1.11__c2e362d2/",
             packageDependencies: new Map([["balanced-match", "1.0.2"],
                                             ["brace-expansion", "1.1.11"],
                                             ["concat-map", "0.0.1"]])}]])],
  ["braces",
  new Map([["2.3.2",
           {
             packageLocation: "/home/cons/.esy/source/i/braces__2.3.2__8146c42d/",
             packageDependencies: new Map([["arr-flatten", "1.1.0"],
                                             ["array-unique", "0.3.2"],
                                             ["braces", "2.3.2"],
                                             ["extend-shallow", "2.0.1"],
                                             ["fill-range", "4.0.0"],
                                             ["isobject", "3.0.1"],
                                             ["repeat-element", "1.1.4"],
                                             ["snapdragon", "0.8.2"],
                                             ["snapdragon-node", "2.1.1"],
                                             ["split-string", "3.1.0"],
                                             ["to-regex", "3.0.2"]])}],
             ["3.0.2",
             {
               packageLocation: "/home/cons/.esy/source/i/braces__3.0.2__5aa7ab81/",
               packageDependencies: new Map([["braces", "3.0.2"],
                                               ["fill-range", "7.0.1"]])}]])],
  ["brorand",
  new Map([["1.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/brorand__1.1.0__d62ade09/",
             packageDependencies: new Map([["brorand", "1.1.0"]])}]])],
  ["browserify-aes",
  new Map([["1.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/browserify_aes__1.2.0__060dc1e3/",
             packageDependencies: new Map([["browserify-aes", "1.2.0"],
                                             ["buffer-xor", "1.0.3"],
                                             ["cipher-base", "1.0.4"],
                                             ["create-hash", "1.2.0"],
                                             ["evp_bytestokey", "1.0.3"],
                                             ["inherits", "2.0.4"],
                                             ["safe-buffer", "5.2.1"]])}]])],
  ["browserify-cipher",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/browserify_cipher__1.0.1__cfb1e530/",
             packageDependencies: new Map([["browserify-aes", "1.2.0"],
                                             ["browserify-cipher", "1.0.1"],
                                             ["browserify-des", "1.0.2"],
                                             ["evp_bytestokey", "1.0.3"]])}]])],
  ["browserify-des",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/browserify_des__1.0.2__c76c8b44/",
             packageDependencies: new Map([["browserify-des", "1.0.2"],
                                             ["cipher-base", "1.0.4"],
                                             ["des.js", "1.0.1"],
                                             ["inherits", "2.0.4"],
                                             ["safe-buffer", "5.2.1"]])}]])],
  ["browserify-rsa",
  new Map([["4.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/browserify_rsa__4.1.0__e58e6349/",
             packageDependencies: new Map([["bn.js", "5.2.0"],
                                             ["browserify-rsa", "4.1.0"],
                                             ["randombytes", "2.1.0"]])}]])],
  ["browserify-sign",
  new Map([["4.2.1",
           {
             packageLocation: "/home/cons/.esy/source/i/browserify_sign__4.2.1__d6383c10/",
             packageDependencies: new Map([["bn.js", "5.2.0"],
                                             ["browserify-rsa", "4.1.0"],
                                             ["browserify-sign", "4.2.1"],
                                             ["create-hash", "1.2.0"],
                                             ["create-hmac", "1.1.7"],
                                             ["elliptic", "6.5.4"],
                                             ["inherits", "2.0.4"],
                                             ["parse-asn1", "5.1.6"],
                                             ["readable-stream", "3.6.0"],
                                             ["safe-buffer", "5.2.1"]])}]])],
  ["browserify-zlib",
  new Map([["0.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/browserify_zlib__0.2.0__4f472b87/",
             packageDependencies: new Map([["browserify-zlib", "0.2.0"],
                                             ["pako", "1.0.11"]])}]])],
  ["bs-fetch",
  new Map([["0.4.0",
           {
             packageLocation: "/home/cons/.esy/source/i/bs_fetch__0.4.0__f431efa2/",
             packageDependencies: new Map([["bs-fetch", "0.4.0"]])}]])],
  ["bs-platform",
  new Map([["8.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/bs_platform__8.2.0__ddbdd6ba/",
             packageDependencies: new Map([["bs-platform", "8.2.0"]])}]])],
  ["buffer",
  new Map([["4.9.2",
           {
             packageLocation: "/home/cons/.esy/source/i/buffer__4.9.2__1089034e/",
             packageDependencies: new Map([["base64-js", "1.5.1"],
                                             ["buffer", "4.9.2"],
                                             ["ieee754", "1.2.1"],
                                             ["isarray", "1.0.0"]])}]])],
  ["buffer-from",
  new Map([["1.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/buffer_from__1.1.2__f23dfc46/",
             packageDependencies: new Map([["buffer-from", "1.1.2"]])}]])],
  ["buffer-indexof",
  new Map([["1.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/buffer_indexof__1.1.1__35a00846/",
             packageDependencies: new Map([["buffer-indexof", "1.1.1"]])}]])],
  ["buffer-xor",
  new Map([["1.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/buffer_xor__1.0.3__ede1928a/",
             packageDependencies: new Map([["buffer-xor", "1.0.3"]])}]])],
  ["builtin-status-codes",
  new Map([["3.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/builtin_status_codes__3.0.0__1c298d47/",
             packageDependencies: new Map([["builtin-status-codes", "3.0.0"]])}]])],
  ["bytes",
  new Map([["3.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/bytes__3.0.0__e858adb1/",
             packageDependencies: new Map([["bytes", "3.0.0"]])}],
             ["3.1.2",
             {
               packageLocation: "/home/cons/.esy/source/i/bytes__3.1.2__a1f54551/",
               packageDependencies: new Map([["bytes", "3.1.2"]])}]])],
  ["cacache",
  new Map([["12.0.4",
           {
             packageLocation: "/home/cons/.esy/source/i/cacache__12.0.4__acd70ea4/",
             packageDependencies: new Map([["bluebird", "3.7.2"],
                                             ["cacache", "12.0.4"],
                                             ["chownr", "1.1.4"],
                                             ["figgy-pudding", "3.5.2"],
                                             ["glob", "7.2.2"],
                                             ["graceful-fs", "4.2.10"],
                                             ["infer-owner", "1.0.4"],
                                             ["lru-cache", "5.1.1"],
                                             ["mississippi", "3.0.0"],
                                             ["mkdirp", "0.5.6"],
                                             ["move-concurrently", "1.0.1"],
                                             ["promise-inflight", "1.0.1"],
                                             ["rimraf", "2.7.1"],
                                             ["ssri", "6.0.2"],
                                             ["unique-filename", "1.1.1"],
                                             ["y18n", "4.0.3"]])}]])],
  ["cache-base",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/cache_base__1.0.1__ab79e2ff/",
             packageDependencies: new Map([["cache-base", "1.0.1"],
                                             ["collection-visit", "1.0.0"],
                                             ["component-emitter", "1.3.0"],
                                             ["get-value", "2.0.6"],
                                             ["has-value", "1.0.0"],
                                             ["isobject", "3.0.1"],
                                             ["set-value", "2.0.1"],
                                             ["to-object-path", "0.3.0"],
                                             ["union-value", "1.0.1"],
                                             ["unset-value", "1.0.0"]])}]])],
  ["call-bind",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/call_bind__1.0.2__5b48f9ba/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["function-bind", "1.1.1"],
                                             ["get-intrinsic", "1.1.1"]])}]])],
  ["camel-case",
  new Map([["3.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/camel_case__3.0.0__fd201c6c/",
             packageDependencies: new Map([["camel-case", "3.0.0"],
                                             ["no-case", "2.3.2"],
                                             ["upper-case", "1.1.3"]])}]])],
  ["camelcase",
  new Map([["5.3.1",
           {
             packageLocation: "/home/cons/.esy/source/i/camelcase__5.3.1__f083c5b6/",
             packageDependencies: new Map([["camelcase", "5.3.1"]])}]])],
  ["chalk",
  new Map([["2.4.2",
           {
             packageLocation: "/home/cons/.esy/source/i/chalk__2.4.2__cdd4307b/",
             packageDependencies: new Map([["ansi-styles", "3.2.1"],
                                             ["chalk", "2.4.2"],
                                             ["escape-string-regexp",
                                             "1.0.5"],
                                             ["supports-color", "5.5.0"]])}]])],
  ["chokidar",
  new Map([["2.1.8",
           {
             packageLocation: "/home/cons/.esy/source/i/chokidar__2.1.8__c2e79b59/",
             packageDependencies: new Map([["anymatch", "2.0.0"],
                                             ["async-each", "1.0.3"],
                                             ["braces", "2.3.2"],
                                             ["chokidar", "2.1.8"],
                                             ["fsevents", "1.2.13"],
                                             ["glob-parent", "3.1.0"],
                                             ["inherits", "2.0.4"],
                                             ["is-binary-path", "1.0.1"],
                                             ["is-glob", "4.0.3"],
                                             ["normalize-path", "3.0.0"],
                                             ["path-is-absolute", "1.0.1"],
                                             ["readdirp", "2.2.1"],
                                             ["upath", "1.2.0"]])}],
             ["3.5.3",
             {
               packageLocation: "/home/cons/.esy/source/i/chokidar__3.5.3__b46c11ce/",
               packageDependencies: new Map([["anymatch", "3.1.2"],
                                               ["braces", "3.0.2"],
                                               ["chokidar", "3.5.3"],
                                               ["fsevents", "2.3.2"],
                                               ["glob-parent", "5.1.2"],
                                               ["is-binary-path", "2.1.0"],
                                               ["is-glob", "4.0.3"],
                                               ["normalize-path", "3.0.0"],
                                               ["readdirp", "3.6.0"]])}]])],
  ["chownr",
  new Map([["1.1.4",
           {
             packageLocation: "/home/cons/.esy/source/i/chownr__1.1.4__597887ef/",
             packageDependencies: new Map([["chownr", "1.1.4"]])}]])],
  ["chrome-trace-event",
  new Map([["1.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/chrome_trace_event__1.0.3__b08140d5/",
             packageDependencies: new Map([["chrome-trace-event", "1.0.3"]])}]])],
  ["cipher-base",
  new Map([["1.0.4",
           {
             packageLocation: "/home/cons/.esy/source/i/cipher_base__1.0.4__f83cb60b/",
             packageDependencies: new Map([["cipher-base", "1.0.4"],
                                             ["inherits", "2.0.4"],
                                             ["safe-buffer", "5.2.1"]])}]])],
  ["class-utils",
  new Map([["0.3.6",
           {
             packageLocation: "/home/cons/.esy/source/i/class_utils__0.3.6__3ab22a3d/",
             packageDependencies: new Map([["arr-union", "3.1.0"],
                                             ["class-utils", "0.3.6"],
                                             ["define-property", "0.2.5"],
                                             ["isobject", "3.0.1"],
                                             ["static-extend", "0.1.2"]])}]])],
  ["clean-css",
  new Map([["4.2.4",
           {
             packageLocation: "/home/cons/.esy/source/i/clean_css__4.2.4__39fff97a/",
             packageDependencies: new Map([["clean-css", "4.2.4"],
                                             ["source-map", "0.6.1"]])}]])],
  ["cliui",
  new Map([["5.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/cliui__5.0.0__7e015b22/",
             packageDependencies: new Map([["cliui", "5.0.0"],
                                             ["string-width", "3.1.0"],
                                             ["strip-ansi", "5.2.0"],
                                             ["wrap-ansi", "5.1.0"]])}]])],
  ["collection-visit",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/collection_visit__1.0.0__5ba603a9/",
             packageDependencies: new Map([["collection-visit", "1.0.0"],
                                             ["map-visit", "1.0.0"],
                                             ["object-visit", "1.0.1"]])}]])],
  ["color-convert",
  new Map([["1.9.3",
           {
             packageLocation: "/home/cons/.esy/source/i/color_convert__1.9.3__a7e8c654/",
             packageDependencies: new Map([["color-convert", "1.9.3"],
                                             ["color-name", "1.1.3"]])}]])],
  ["color-name",
  new Map([["1.1.3",
           {
             packageLocation: "/home/cons/.esy/source/i/color_name__1.1.3__2497ef27/",
             packageDependencies: new Map([["color-name", "1.1.3"]])}]])],
  ["commander",
  new Map([["2.17.1",
           {
             packageLocation: "/home/cons/.esy/source/i/commander__2.17.1__50936659/",
             packageDependencies: new Map([["commander", "2.17.1"]])}],
             ["2.19.0",
             {
               packageLocation: "/home/cons/.esy/source/i/commander__2.19.0__2b08e093/",
               packageDependencies: new Map([["commander", "2.19.0"]])}],
             ["2.20.3",
             {
               packageLocation: "/home/cons/.esy/source/i/commander__2.20.3__862c0525/",
               packageDependencies: new Map([["commander", "2.20.3"]])}]])],
  ["commondir",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/commondir__1.0.1__7e150a21/",
             packageDependencies: new Map([["commondir", "1.0.1"]])}]])],
  ["component-emitter",
  new Map([["1.3.0",
           {
             packageLocation: "/home/cons/.esy/source/i/component_emitter__1.3.0__ec2c5ccf/",
             packageDependencies: new Map([["component-emitter", "1.3.0"]])}]])],
  ["compressible",
  new Map([["2.0.18",
           {
             packageLocation: "/home/cons/.esy/source/i/compressible__2.0.18__61dabd69/",
             packageDependencies: new Map([["compressible", "2.0.18"],
                                             ["mime-db", "1.52.0"]])}]])],
  ["compression",
  new Map([["1.7.4",
           {
             packageLocation: "/home/cons/.esy/source/i/compression__1.7.4__c37c0be5/",
             packageDependencies: new Map([["accepts", "1.3.8"],
                                             ["bytes", "3.0.0"],
                                             ["compressible", "2.0.18"],
                                             ["compression", "1.7.4"],
                                             ["debug", "2.6.9"],
                                             ["on-headers", "1.0.2"],
                                             ["safe-buffer", "5.1.2"],
                                             ["vary", "1.1.2"]])}]])],
  ["concat-map",
  new Map([["0.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/concat_map__0.0.1__c7999216/",
             packageDependencies: new Map([["concat-map", "0.0.1"]])}]])],
  ["concat-stream",
  new Map([["1.6.2",
           {
             packageLocation: "/home/cons/.esy/source/i/concat_stream__1.6.2__9a7f0902/",
             packageDependencies: new Map([["buffer-from", "1.1.2"],
                                             ["concat-stream", "1.6.2"],
                                             ["inherits", "2.0.3"],
                                             ["readable-stream", "2.3.7"],
                                             ["typedarray", "0.0.6"]])}]])],
  ["connect-history-api-fallback",
  new Map([["1.6.0",
           {
             packageLocation: "/home/cons/.esy/source/i/connect_history_api_fallback__1.6.0__e1684720/",
             packageDependencies: new Map([["connect-history-api-fallback",
                                           "1.6.0"]])}]])],
  ["console-browserify",
  new Map([["1.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/console_browserify__1.2.0__d6d684b8/",
             packageDependencies: new Map([["console-browserify", "1.2.0"]])}]])],
  ["constants-browserify",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/constants_browserify__1.0.0__bdaaf074/",
             packageDependencies: new Map([["constants-browserify", "1.0.0"]])}]])],
  ["content-disposition",
  new Map([["0.5.4",
           {
             packageLocation: "/home/cons/.esy/source/i/content_disposition__0.5.4__52d8a27a/",
             packageDependencies: new Map([["content-disposition", "0.5.4"],
                                             ["safe-buffer", "5.2.1"]])}]])],
  ["content-type",
  new Map([["1.0.4",
           {
             packageLocation: "/home/cons/.esy/source/i/content_type__1.0.4__de9fccdf/",
             packageDependencies: new Map([["content-type", "1.0.4"]])}]])],
  ["cookie",
  new Map([["0.5.0",
           {
             packageLocation: "/home/cons/.esy/source/i/cookie__0.5.0__00603c54/",
             packageDependencies: new Map([["cookie", "0.5.0"]])}]])],
  ["cookie-signature",
  new Map([["1.0.6",
           {
             packageLocation: "/home/cons/.esy/source/i/cookie_signature__1.0.6__0a93d3a9/",
             packageDependencies: new Map([["cookie-signature", "1.0.6"]])}]])],
  ["copy-concurrently",
  new Map([["1.0.5",
           {
             packageLocation: "/home/cons/.esy/source/i/copy_concurrently__1.0.5__6c5abd00/",
             packageDependencies: new Map([["aproba", "1.2.0"],
                                             ["copy-concurrently", "1.0.5"],
                                             ["fs-write-stream-atomic",
                                             "1.0.10"],
                                             ["iferr", "0.1.5"],
                                             ["mkdirp", "0.5.6"],
                                             ["rimraf", "2.7.1"],
                                             ["run-queue", "1.0.3"]])}]])],
  ["copy-descriptor",
  new Map([["0.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/copy_descriptor__0.1.1__b4878afe/",
             packageDependencies: new Map([["copy-descriptor", "0.1.1"]])}]])],
  ["copy-webpack-plugin",
  new Map([["5.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/copy_webpack_plugin__5.1.2__5ba35fb8/",
             packageDependencies: new Map([["cacache", "12.0.4"],
                                             ["copy-webpack-plugin", "5.1.2"],
                                             ["find-cache-dir", "2.1.0"],
                                             ["glob-parent", "3.1.0"],
                                             ["globby", "7.1.1"],
                                             ["is-glob", "4.0.3"],
                                             ["loader-utils", "1.4.0"],
                                             ["minimatch", "3.1.2"],
                                             ["normalize-path", "3.0.0"],
                                             ["p-limit", "2.3.0"],
                                             ["schema-utils", "1.0.0"],
                                             ["serialize-javascript",
                                             "4.0.0"],
                                             ["webpack", "4.46.0"],
                                             ["webpack-log", "2.0.0"]])}]])],
  ["core-util-is",
  new Map([["1.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/core_util_is__1.0.3__9b7e4517/",
             packageDependencies: new Map([["core-util-is", "1.0.3"]])}]])],
  ["create-ecdh",
  new Map([["4.0.4",
           {
             packageLocation: "/home/cons/.esy/source/i/create_ecdh__4.0.4__ac243d6f/",
             packageDependencies: new Map([["bn.js", "4.12.0"],
                                             ["create-ecdh", "4.0.4"],
                                             ["elliptic", "6.5.4"]])}]])],
  ["create-hash",
  new Map([["1.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/create_hash__1.2.0__ed4bf55b/",
             packageDependencies: new Map([["cipher-base", "1.0.4"],
                                             ["create-hash", "1.2.0"],
                                             ["inherits", "2.0.4"],
                                             ["md5.js", "1.3.5"],
                                             ["ripemd160", "2.0.2"],
                                             ["sha.js", "2.4.11"]])}]])],
  ["create-hmac",
  new Map([["1.1.7",
           {
             packageLocation: "/home/cons/.esy/source/i/create_hmac__1.1.7__6d041196/",
             packageDependencies: new Map([["cipher-base", "1.0.4"],
                                             ["create-hash", "1.2.0"],
                                             ["create-hmac", "1.1.7"],
                                             ["inherits", "2.0.4"],
                                             ["ripemd160", "2.0.2"],
                                             ["safe-buffer", "5.2.1"],
                                             ["sha.js", "2.4.11"]])}]])],
  ["cross-spawn",
  new Map([["6.0.5",
           {
             packageLocation: "/home/cons/.esy/source/i/cross_spawn__6.0.5__396ecb10/",
             packageDependencies: new Map([["cross-spawn", "6.0.5"],
                                             ["nice-try", "1.0.5"],
                                             ["path-key", "2.0.1"],
                                             ["semver", "5.7.1"],
                                             ["shebang-command", "1.2.0"],
                                             ["which", "1.3.1"]])}]])],
  ["crypto-browserify",
  new Map([["3.12.0",
           {
             packageLocation: "/home/cons/.esy/source/i/crypto_browserify__3.12.0__245f7640/",
             packageDependencies: new Map([["browserify-cipher", "1.0.1"],
                                             ["browserify-sign", "4.2.1"],
                                             ["create-ecdh", "4.0.4"],
                                             ["create-hash", "1.2.0"],
                                             ["create-hmac", "1.1.7"],
                                             ["crypto-browserify", "3.12.0"],
                                             ["diffie-hellman", "5.0.3"],
                                             ["inherits", "2.0.4"],
                                             ["pbkdf2", "3.1.2"],
                                             ["public-encrypt", "4.0.3"],
                                             ["randombytes", "2.1.0"],
                                             ["randomfill", "1.0.4"]])}]])],
  ["css-select",
  new Map([["4.3.0",
           {
             packageLocation: "/home/cons/.esy/source/i/css_select__4.3.0__d7b88c75/",
             packageDependencies: new Map([["boolbase", "1.0.0"],
                                             ["css-select", "4.3.0"],
                                             ["css-what", "6.1.0"],
                                             ["domhandler", "4.3.1"],
                                             ["domutils", "2.8.0"],
                                             ["nth-check", "2.0.1"]])}]])],
  ["css-what",
  new Map([["6.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/css_what__6.1.0__f5549109/",
             packageDependencies: new Map([["css-what", "6.1.0"]])}]])],
  ["cyclist",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/cyclist__1.0.1__54b8a80f/",
             packageDependencies: new Map([["cyclist", "1.0.1"]])}]])],
  ["debug",
  new Map([["2.6.9",
           {
             packageLocation: "/home/cons/.esy/source/i/debug__2.6.9__8eaf8f1e/",
             packageDependencies: new Map([["debug", "2.6.9"],
                                             ["ms", "2.0.0"]])}],
             ["3.2.7",
             {
               packageLocation: "/home/cons/.esy/source/i/debug__3.2.7__0d44723a/",
               packageDependencies: new Map([["debug", "3.2.7"],
                                               ["ms", "2.1.3"]])}],
             ["4.3.4",
             {
               packageLocation: "/home/cons/.esy/source/i/debug__4.3.4__84af5971/",
               packageDependencies: new Map([["debug", "4.3.4"],
                                               ["ms", "2.1.2"]])}]])],
  ["decamelize",
  new Map([["1.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/decamelize__1.2.0__8db54854/",
             packageDependencies: new Map([["decamelize", "1.2.0"]])}]])],
  ["decode-uri-component",
  new Map([["0.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/decode_uri_component__0.2.0__85d618dc/",
             packageDependencies: new Map([["decode-uri-component", "0.2.0"]])}]])],
  ["deep-equal",
  new Map([["1.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/deep_equal__1.1.1__a7fd4bc9/",
             packageDependencies: new Map([["deep-equal", "1.1.1"],
                                             ["is-arguments", "1.1.1"],
                                             ["is-date-object", "1.0.5"],
                                             ["is-regex", "1.1.4"],
                                             ["object-is", "1.1.5"],
                                             ["object-keys", "1.1.1"],
                                             ["regexp.prototype.flags",
                                             "1.4.3"]])}]])],
  ["default-gateway",
  new Map([["4.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/default_gateway__4.2.0__bf86f29b/",
             packageDependencies: new Map([["default-gateway", "4.2.0"],
                                             ["execa", "1.0.0"],
                                             ["ip-regex", "2.1.0"]])}]])],
  ["define-properties",
  new Map([["1.1.4",
           {
             packageLocation: "/home/cons/.esy/source/i/define_properties__1.1.4__750f55d3/",
             packageDependencies: new Map([["define-properties", "1.1.4"],
                                             ["has-property-descriptors",
                                             "1.0.0"],
                                             ["object-keys", "1.1.1"]])}]])],
  ["define-property",
  new Map([["0.2.5",
           {
             packageLocation: "/home/cons/.esy/source/i/define_property__0.2.5__35bf1352/",
             packageDependencies: new Map([["define-property", "0.2.5"],
                                             ["is-descriptor", "0.1.6"]])}],
             ["1.0.0",
             {
               packageLocation: "/home/cons/.esy/source/i/define_property__1.0.0__f7276e5e/",
               packageDependencies: new Map([["define-property", "1.0.0"],
                                               ["is-descriptor", "1.0.2"]])}],
             ["2.0.2",
             {
               packageLocation: "/home/cons/.esy/source/i/define_property__2.0.2__aa71f45e/",
               packageDependencies: new Map([["define-property", "2.0.2"],
                                               ["is-descriptor", "1.0.2"],
                                               ["isobject", "3.0.1"]])}]])],
  ["del",
  new Map([["4.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/del__4.1.1__7efd58ba/",
             packageDependencies: new Map([["@types/glob", "7.2.0"],
                                             ["del", "4.1.1"],
                                             ["globby", "6.1.0"],
                                             ["is-path-cwd", "2.2.0"],
                                             ["is-path-in-cwd", "2.1.0"],
                                             ["p-map", "2.1.0"],
                                             ["pify", "4.0.1"],
                                             ["rimraf", "2.7.1"]])}]])],
  ["depd",
  new Map([["1.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/depd__1.1.2__5a587264/",
             packageDependencies: new Map([["depd", "1.1.2"]])}],
             ["2.0.0",
             {
               packageLocation: "/home/cons/.esy/source/i/depd__2.0.0__b402d6b8/",
               packageDependencies: new Map([["depd", "2.0.0"]])}]])],
  ["des.js",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/des.js__1.0.1__dcae382a/",
             packageDependencies: new Map([["des.js", "1.0.1"],
                                             ["inherits", "2.0.4"],
                                             ["minimalistic-assert", "1.0.1"]])}]])],
  ["destroy",
  new Map([["1.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/destroy__1.2.0__486e1713/",
             packageDependencies: new Map([["destroy", "1.2.0"]])}]])],
  ["detect-file",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/detect_file__1.0.0__055d4bf6/",
             packageDependencies: new Map([["detect-file", "1.0.0"]])}]])],
  ["detect-node",
  new Map([["2.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/detect_node__2.1.0__0f4b11f7/",
             packageDependencies: new Map([["detect-node", "2.1.0"]])}]])],
  ["diffie-hellman",
  new Map([["5.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/diffie_hellman__5.0.3__1edebd66/",
             packageDependencies: new Map([["bn.js", "4.12.0"],
                                             ["diffie-hellman", "5.0.3"],
                                             ["miller-rabin", "4.0.1"],
                                             ["randombytes", "2.1.0"]])}]])],
  ["dir-glob",
  new Map([["2.2.2",
           {
             packageLocation: "/home/cons/.esy/source/i/dir_glob__2.2.2__1c4c40a7/",
             packageDependencies: new Map([["dir-glob", "2.2.2"],
                                             ["path-type", "3.0.0"]])}]])],
  ["dns-equal",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/dns_equal__1.0.0__a90a6625/",
             packageDependencies: new Map([["dns-equal", "1.0.0"]])}]])],
  ["dns-packet",
  new Map([["1.3.4",
           {
             packageLocation: "/home/cons/.esy/source/i/dns_packet__1.3.4__f7041f77/",
             packageDependencies: new Map([["dns-packet", "1.3.4"],
                                             ["ip", "1.1.8"],
                                             ["safe-buffer", "5.2.1"]])}]])],
  ["dns-txt",
  new Map([["2.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/dns_txt__2.0.2__4e21e52c/",
             packageDependencies: new Map([["buffer-indexof", "1.1.1"],
                                             ["dns-txt", "2.0.2"]])}]])],
  ["dom-converter",
  new Map([["0.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/dom_converter__0.2.0__5f670230/",
             packageDependencies: new Map([["dom-converter", "0.2.0"],
                                             ["utila", "0.4.0"]])}]])],
  ["dom-serializer",
  new Map([["1.4.1",
           {
             packageLocation: "/home/cons/.esy/source/i/dom_serializer__1.4.1__59281f91/",
             packageDependencies: new Map([["dom-serializer", "1.4.1"],
                                             ["domelementtype", "2.3.0"],
                                             ["domhandler", "4.3.1"],
                                             ["entities", "2.2.0"]])}]])],
  ["domain-browser",
  new Map([["1.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/domain_browser__1.2.0__ec710723/",
             packageDependencies: new Map([["domain-browser", "1.2.0"]])}]])],
  ["domelementtype",
  new Map([["2.3.0",
           {
             packageLocation: "/home/cons/.esy/source/i/domelementtype__2.3.0__7da79419/",
             packageDependencies: new Map([["domelementtype", "2.3.0"]])}]])],
  ["domhandler",
  new Map([["4.3.1",
           {
             packageLocation: "/home/cons/.esy/source/i/domhandler__4.3.1__74473e92/",
             packageDependencies: new Map([["domelementtype", "2.3.0"],
                                             ["domhandler", "4.3.1"]])}]])],
  ["domutils",
  new Map([["2.8.0",
           {
             packageLocation: "/home/cons/.esy/source/i/domutils__2.8.0__e6970228/",
             packageDependencies: new Map([["dom-serializer", "1.4.1"],
                                             ["domelementtype", "2.3.0"],
                                             ["domhandler", "4.3.1"],
                                             ["domutils", "2.8.0"]])}]])],
  ["duplexify",
  new Map([["3.7.1",
           {
             packageLocation: "/home/cons/.esy/source/i/duplexify__3.7.1__a6e2abdc/",
             packageDependencies: new Map([["duplexify", "3.7.1"],
                                             ["end-of-stream", "1.4.4"],
                                             ["inherits", "2.0.3"],
                                             ["readable-stream", "2.3.7"],
                                             ["stream-shift", "1.0.1"]])}]])],
  ["ee-first",
  new Map([["1.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/ee_first__1.1.1__ab35044e/",
             packageDependencies: new Map([["ee-first", "1.1.1"]])}]])],
  ["elliptic",
  new Map([["6.5.4",
           {
             packageLocation: "/home/cons/.esy/source/i/elliptic__6.5.4__f5e3a40d/",
             packageDependencies: new Map([["bn.js", "4.12.0"],
                                             ["brorand", "1.1.0"],
                                             ["elliptic", "6.5.4"],
                                             ["hash.js", "1.1.7"],
                                             ["hmac-drbg", "1.0.1"],
                                             ["inherits", "2.0.4"],
                                             ["minimalistic-assert", "1.0.1"],
                                             ["minimalistic-crypto-utils",
                                             "1.0.1"]])}]])],
  ["emoji-regex",
  new Map([["7.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/emoji_regex__7.0.3__d6dfe2a1/",
             packageDependencies: new Map([["emoji-regex", "7.0.3"]])}]])],
  ["emojis-list",
  new Map([["2.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/emojis_list__2.1.0__3f5f22d9/",
             packageDependencies: new Map([["emojis-list", "2.1.0"]])}],
             ["3.0.0",
             {
               packageLocation: "/home/cons/.esy/source/i/emojis_list__3.0.0__564bece5/",
               packageDependencies: new Map([["emojis-list", "3.0.0"]])}]])],
  ["encodeurl",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/encodeurl__1.0.2__dcc1af85/",
             packageDependencies: new Map([["encodeurl", "1.0.2"]])}]])],
  ["end-of-stream",
  new Map([["1.4.4",
           {
             packageLocation: "/home/cons/.esy/source/i/end_of_stream__1.4.4__29536c64/",
             packageDependencies: new Map([["end-of-stream", "1.4.4"],
                                             ["once", "1.4.0"]])}]])],
  ["enhanced-resolve",
  new Map([["4.5.0",
           {
             packageLocation: "/home/cons/.esy/source/i/enhanced_resolve__4.5.0__76217e8c/",
             packageDependencies: new Map([["enhanced-resolve", "4.5.0"],
                                             ["graceful-fs", "4.2.10"],
                                             ["memory-fs", "0.5.0"],
                                             ["tapable", "1.1.3"]])}]])],
  ["entities",
  new Map([["2.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/entities__2.2.0__1315db62/",
             packageDependencies: new Map([["entities", "2.2.0"]])}]])],
  ["errno",
  new Map([["0.1.8",
           {
             packageLocation: "/home/cons/.esy/source/i/errno__0.1.8__754bc14a/",
             packageDependencies: new Map([["errno", "0.1.8"],
                                             ["prr", "1.0.1"]])}]])],
  ["es-abstract",
  new Map([["1.20.0",
           {
             packageLocation: "/home/cons/.esy/source/i/es_abstract__1.20.0__027b0011/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["es-abstract", "1.20.0"],
                                             ["es-to-primitive", "1.2.1"],
                                             ["function-bind", "1.1.1"],
                                             ["function.prototype.name",
                                             "1.1.5"],
                                             ["get-intrinsic", "1.1.1"],
                                             ["get-symbol-description",
                                             "1.0.0"],
                                             ["has", "1.0.3"],
                                             ["has-property-descriptors",
                                             "1.0.0"],
                                             ["has-symbols", "1.0.3"],
                                             ["internal-slot", "1.0.3"],
                                             ["is-callable", "1.2.4"],
                                             ["is-negative-zero", "2.0.2"],
                                             ["is-regex", "1.1.4"],
                                             ["is-shared-array-buffer",
                                             "1.0.2"],
                                             ["is-string", "1.0.7"],
                                             ["is-weakref", "1.0.2"],
                                             ["object-inspect", "1.12.0"],
                                             ["object-keys", "1.1.1"],
                                             ["object.assign", "4.1.2"],
                                             ["regexp.prototype.flags",
                                             "1.4.3"],
                                             ["string.prototype.trimend",
                                             "1.0.5"],
                                             ["string.prototype.trimstart",
                                             "1.0.5"],
                                             ["unbox-primitive", "1.0.2"]])}]])],
  ["es-to-primitive",
  new Map([["1.2.1",
           {
             packageLocation: "/home/cons/.esy/source/i/es_to_primitive__1.2.1__5bdeba0e/",
             packageDependencies: new Map([["es-to-primitive", "1.2.1"],
                                             ["is-callable", "1.2.4"],
                                             ["is-date-object", "1.0.5"],
                                             ["is-symbol", "1.0.4"]])}]])],
  ["escape-html",
  new Map([["1.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/escape_html__1.0.3__89c8e646/",
             packageDependencies: new Map([["escape-html", "1.0.3"]])}]])],
  ["escape-string-regexp",
  new Map([["1.0.5",
           {
             packageLocation: "/home/cons/.esy/source/i/escape_string_regexp__1.0.5__08b8b625/",
             packageDependencies: new Map([["escape-string-regexp", "1.0.5"]])}]])],
  ["eslint-scope",
  new Map([["4.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/eslint_scope__4.0.3__d18e3b0a/",
             packageDependencies: new Map([["eslint-scope", "4.0.3"],
                                             ["esrecurse", "4.3.0"],
                                             ["estraverse", "4.3.0"]])}]])],
  ["esrecurse",
  new Map([["4.3.0",
           {
             packageLocation: "/home/cons/.esy/source/i/esrecurse__4.3.0__905a981b/",
             packageDependencies: new Map([["esrecurse", "4.3.0"],
                                             ["estraverse", "5.3.0"]])}]])],
  ["estraverse",
  new Map([["4.3.0",
           {
             packageLocation: "/home/cons/.esy/source/i/estraverse__4.3.0__539360ea/",
             packageDependencies: new Map([["estraverse", "4.3.0"]])}],
             ["5.3.0",
             {
               packageLocation: "/home/cons/.esy/source/i/estraverse__5.3.0__f2da041e/",
               packageDependencies: new Map([["estraverse", "5.3.0"]])}]])],
  ["etag",
  new Map([["1.8.1",
           {
             packageLocation: "/home/cons/.esy/source/i/etag__1.8.1__9339258c/",
             packageDependencies: new Map([["etag", "1.8.1"]])}]])],
  ["eventemitter3",
  new Map([["4.0.7",
           {
             packageLocation: "/home/cons/.esy/source/i/eventemitter3__4.0.7__4d4dc8c3/",
             packageDependencies: new Map([["eventemitter3", "4.0.7"]])}]])],
  ["events",
  new Map([["3.3.0",
           {
             packageLocation: "/home/cons/.esy/source/i/events__3.3.0__f337db48/",
             packageDependencies: new Map([["events", "3.3.0"]])}]])],
  ["eventsource",
  new Map([["1.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/eventsource__1.1.1__3f829012/",
             packageDependencies: new Map([["eventsource", "1.1.1"],
                                             ["original", "1.0.2"]])}]])],
  ["evp_bytestokey",
  new Map([["1.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/evp__bytestokey__1.0.3__c8858746/",
             packageDependencies: new Map([["evp_bytestokey", "1.0.3"],
                                             ["md5.js", "1.3.5"],
                                             ["safe-buffer", "5.2.1"]])}]])],
  ["execa",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/execa__1.0.0__7c978f7c/",
             packageDependencies: new Map([["cross-spawn", "6.0.5"],
                                             ["execa", "1.0.0"],
                                             ["get-stream", "4.1.0"],
                                             ["is-stream", "1.1.0"],
                                             ["npm-run-path", "2.0.2"],
                                             ["p-finally", "1.0.0"],
                                             ["signal-exit", "3.0.7"],
                                             ["strip-eof", "1.0.0"]])}]])],
  ["expand-brackets",
  new Map([["2.1.4",
           {
             packageLocation: "/home/cons/.esy/source/i/expand_brackets__2.1.4__15f41e0c/",
             packageDependencies: new Map([["debug", "2.6.9"],
                                             ["define-property", "0.2.5"],
                                             ["expand-brackets", "2.1.4"],
                                             ["extend-shallow", "2.0.1"],
                                             ["posix-character-classes",
                                             "0.1.1"],
                                             ["regex-not", "1.0.2"],
                                             ["snapdragon", "0.8.2"],
                                             ["to-regex", "3.0.2"]])}]])],
  ["expand-tilde",
  new Map([["2.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/expand_tilde__2.0.2__5ca545ca/",
             packageDependencies: new Map([["expand-tilde", "2.0.2"],
                                             ["homedir-polyfill", "1.0.3"]])}]])],
  ["express",
  new Map([["4.18.1",
           {
             packageLocation: "/home/cons/.esy/source/i/express__4.18.1__bb465d89/",
             packageDependencies: new Map([["accepts", "1.3.8"],
                                             ["array-flatten", "1.1.1"],
                                             ["body-parser", "1.20.0"],
                                             ["content-disposition", "0.5.4"],
                                             ["content-type", "1.0.4"],
                                             ["cookie", "0.5.0"],
                                             ["cookie-signature", "1.0.6"],
                                             ["debug", "2.6.9"],
                                             ["depd", "2.0.0"],
                                             ["encodeurl", "1.0.2"],
                                             ["escape-html", "1.0.3"],
                                             ["etag", "1.8.1"],
                                             ["express", "4.18.1"],
                                             ["finalhandler", "1.2.0"],
                                             ["fresh", "0.5.2"],
                                             ["http-errors", "2.0.0"],
                                             ["merge-descriptors", "1.0.1"],
                                             ["methods", "1.1.2"],
                                             ["on-finished", "2.4.1"],
                                             ["parseurl", "1.3.3"],
                                             ["path-to-regexp", "0.1.7"],
                                             ["proxy-addr", "2.0.7"],
                                             ["qs", "6.10.3"],
                                             ["range-parser", "1.2.1"],
                                             ["safe-buffer", "5.2.1"],
                                             ["send", "0.18.0"],
                                             ["serve-static", "1.15.0"],
                                             ["setprototypeof", "1.2.0"],
                                             ["statuses", "2.0.1"],
                                             ["type-is", "1.6.18"],
                                             ["utils-merge", "1.0.1"],
                                             ["vary", "1.1.2"]])}]])],
  ["extend-shallow",
  new Map([["2.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/extend_shallow__2.0.1__65c3deaf/",
             packageDependencies: new Map([["extend-shallow", "2.0.1"],
                                             ["is-extendable", "0.1.1"]])}],
             ["3.0.2",
             {
               packageLocation: "/home/cons/.esy/source/i/extend_shallow__3.0.2__8e38f124/",
               packageDependencies: new Map([["assign-symbols", "1.0.0"],
                                               ["extend-shallow", "3.0.2"],
                                               ["is-extendable", "1.0.1"]])}]])],
  ["extglob",
  new Map([["2.0.4",
           {
             packageLocation: "/home/cons/.esy/source/i/extglob__2.0.4__ff5831fb/",
             packageDependencies: new Map([["array-unique", "0.3.2"],
                                             ["define-property", "1.0.0"],
                                             ["expand-brackets", "2.1.4"],
                                             ["extend-shallow", "2.0.1"],
                                             ["extglob", "2.0.4"],
                                             ["fragment-cache", "0.2.1"],
                                             ["regex-not", "1.0.2"],
                                             ["snapdragon", "0.8.2"],
                                             ["to-regex", "3.0.2"]])}]])],
  ["fast-deep-equal",
  new Map([["3.1.3",
           {
             packageLocation: "/home/cons/.esy/source/i/fast_deep_equal__3.1.3__973bc016/",
             packageDependencies: new Map([["fast-deep-equal", "3.1.3"]])}]])],
  ["fast-json-stable-stringify",
  new Map([["2.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/fast_json_stable_stringify__2.1.0__e7b65021/",
             packageDependencies: new Map([["fast-json-stable-stringify",
                                           "2.1.0"]])}]])],
  ["faye-websocket",
  new Map([["0.11.4",
           {
             packageLocation: "/home/cons/.esy/source/i/faye_websocket__0.11.4__b5464de2/",
             packageDependencies: new Map([["faye-websocket", "0.11.4"],
                                             ["websocket-driver", "0.7.4"]])}]])],
  ["figgy-pudding",
  new Map([["3.5.2",
           {
             packageLocation: "/home/cons/.esy/source/i/figgy_pudding__3.5.2__3cd9c113/",
             packageDependencies: new Map([["figgy-pudding", "3.5.2"]])}]])],
  ["file-uri-to-path",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/file_uri_to_path__1.0.0__9a218bbb/",
             packageDependencies: new Map([["file-uri-to-path", "1.0.0"]])}]])],
  ["fill-range",
  new Map([["4.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/fill_range__4.0.0__d5dfefd7/",
             packageDependencies: new Map([["extend-shallow", "2.0.1"],
                                             ["fill-range", "4.0.0"],
                                             ["is-number", "3.0.0"],
                                             ["repeat-string", "1.6.1"],
                                             ["to-regex-range", "2.1.1"]])}],
             ["7.0.1",
             {
               packageLocation: "/home/cons/.esy/source/i/fill_range__7.0.1__2354263a/",
               packageDependencies: new Map([["fill-range", "7.0.1"],
                                               ["to-regex-range", "5.0.1"]])}]])],
  ["finalhandler",
  new Map([["1.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/finalhandler__1.2.0__f579b733/",
             packageDependencies: new Map([["debug", "2.6.9"],
                                             ["encodeurl", "1.0.2"],
                                             ["escape-html", "1.0.3"],
                                             ["finalhandler", "1.2.0"],
                                             ["on-finished", "2.4.1"],
                                             ["parseurl", "1.3.3"],
                                             ["statuses", "2.0.1"],
                                             ["unpipe", "1.0.0"]])}]])],
  ["find-cache-dir",
  new Map([["2.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/find_cache_dir__2.1.0__e3d97cdf/",
             packageDependencies: new Map([["commondir", "1.0.1"],
                                             ["find-cache-dir", "2.1.0"],
                                             ["make-dir", "2.1.0"],
                                             ["pkg-dir", "3.0.0"]])}]])],
  ["find-up",
  new Map([["3.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/find_up__3.0.0__30e86e01/",
             packageDependencies: new Map([["find-up", "3.0.0"],
                                             ["locate-path", "3.0.0"]])}]])],
  ["findup-sync",
  new Map([["3.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/findup_sync__3.0.0__ce917286/",
             packageDependencies: new Map([["detect-file", "1.0.0"],
                                             ["findup-sync", "3.0.0"],
                                             ["is-glob", "4.0.3"],
                                             ["micromatch", "3.1.10"],
                                             ["resolve-dir", "1.0.1"]])}]])],
  ["flush-write-stream",
  new Map([["1.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/flush_write_stream__1.1.1__04d2efbf/",
             packageDependencies: new Map([["flush-write-stream", "1.1.1"],
                                             ["inherits", "2.0.3"],
                                             ["readable-stream", "2.3.7"]])}]])],
  ["follow-redirects",
  new Map([["1.15.0",
           {
             packageLocation: "/home/cons/.esy/source/i/follow_redirects__1.15.0__386d3e1c/",
             packageDependencies: new Map([["follow-redirects", "1.15.0"]])}]])],
  ["for-in",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/for_in__1.0.2__8016c44d/",
             packageDependencies: new Map([["for-in", "1.0.2"]])}]])],
  ["forwarded",
  new Map([["0.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/forwarded__0.2.0__4a257222/",
             packageDependencies: new Map([["forwarded", "0.2.0"]])}]])],
  ["fragment-cache",
  new Map([["0.2.1",
           {
             packageLocation: "/home/cons/.esy/source/i/fragment_cache__0.2.1__6a18be86/",
             packageDependencies: new Map([["fragment-cache", "0.2.1"],
                                             ["map-cache", "0.2.2"]])}]])],
  ["fresh",
  new Map([["0.5.2",
           {
             packageLocation: "/home/cons/.esy/source/i/fresh__0.5.2__c27d9c34/",
             packageDependencies: new Map([["fresh", "0.5.2"]])}]])],
  ["from2",
  new Map([["2.3.0",
           {
             packageLocation: "/home/cons/.esy/source/i/from2__2.3.0__dbf82e4a/",
             packageDependencies: new Map([["from2", "2.3.0"],
                                             ["inherits", "2.0.3"],
                                             ["readable-stream", "2.3.7"]])}]])],
  ["fs-write-stream-atomic",
  new Map([["1.0.10",
           {
             packageLocation: "/home/cons/.esy/source/i/fs_write_stream_atomic__1.0.10__2e86c5b1/",
             packageDependencies: new Map([["fs-write-stream-atomic",
                                           "1.0.10"],
                                             ["graceful-fs", "4.2.10"],
                                             ["iferr", "0.1.5"],
                                             ["imurmurhash", "0.1.4"],
                                             ["readable-stream", "2.3.7"]])}]])],
  ["fs.realpath",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/fs.realpath__1.0.0__094c11ca/",
             packageDependencies: new Map([["fs.realpath", "1.0.0"]])}]])],
  ["fsevents",
  new Map([["1.2.13",
           {
             packageLocation: "/home/cons/.esy/source/i/fsevents__1.2.13__abc3ee2e/",
             packageDependencies: new Map([["bindings", "1.5.0"],
                                             ["fsevents", "1.2.13"],
                                             ["nan", "2.15.0"]])}],
             ["2.3.2",
             {
               packageLocation: "/home/cons/.esy/source/i/fsevents__2.3.2__d3d926a0/",
               packageDependencies: new Map([["fsevents", "2.3.2"]])}]])],
  ["function-bind",
  new Map([["1.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/function_bind__1.1.1__98f8a427/",
             packageDependencies: new Map([["function-bind", "1.1.1"]])}]])],
  ["function.prototype.name",
  new Map([["1.1.5",
           {
             packageLocation: "/home/cons/.esy/source/i/function.prototype.name__1.1.5__cd82cf58/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["define-properties", "1.1.4"],
                                             ["es-abstract", "1.20.0"],
                                             ["function.prototype.name",
                                             "1.1.5"],
                                             ["functions-have-names",
                                             "1.2.3"]])}]])],
  ["functions-have-names",
  new Map([["1.2.3",
           {
             packageLocation: "/home/cons/.esy/source/i/functions_have_names__1.2.3__095ffa2c/",
             packageDependencies: new Map([["functions-have-names", "1.2.3"]])}]])],
  ["get-caller-file",
  new Map([["2.0.5",
           {
             packageLocation: "/home/cons/.esy/source/i/get_caller_file__2.0.5__ef007ca2/",
             packageDependencies: new Map([["get-caller-file", "2.0.5"]])}]])],
  ["get-intrinsic",
  new Map([["1.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/get_intrinsic__1.1.1__968d02eb/",
             packageDependencies: new Map([["function-bind", "1.1.1"],
                                             ["get-intrinsic", "1.1.1"],
                                             ["has", "1.0.3"],
                                             ["has-symbols", "1.0.3"]])}]])],
  ["get-stream",
  new Map([["4.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/get_stream__4.1.0__c6459916/",
             packageDependencies: new Map([["get-stream", "4.1.0"],
                                             ["pump", "3.0.0"]])}]])],
  ["get-symbol-description",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/get_symbol_description__1.0.0__062b0644/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["get-intrinsic", "1.1.1"],
                                             ["get-symbol-description",
                                             "1.0.0"]])}]])],
  ["get-value",
  new Map([["2.0.6",
           {
             packageLocation: "/home/cons/.esy/source/i/get_value__2.0.6__147b5c9f/",
             packageDependencies: new Map([["get-value", "2.0.6"]])}]])],
  ["glob",
  new Map([["7.2.2",
           {
             packageLocation: "/home/cons/.esy/source/i/glob__7.2.2__dcf5869f/",
             packageDependencies: new Map([["fs.realpath", "1.0.0"],
                                             ["glob", "7.2.2"],
                                             ["inflight", "1.0.6"],
                                             ["inherits", "2.0.4"],
                                             ["minimatch", "3.1.2"],
                                             ["once", "1.4.0"],
                                             ["path-is-absolute", "1.0.1"]])}]])],
  ["glob-parent",
  new Map([["3.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/glob_parent__3.1.0__cbff0fa9/",
             packageDependencies: new Map([["glob-parent", "3.1.0"],
                                             ["is-glob", "3.1.0"],
                                             ["path-dirname", "1.0.2"]])}],
             ["5.1.2",
             {
               packageLocation: "/home/cons/.esy/source/i/glob_parent__5.1.2__4ec35c05/",
               packageDependencies: new Map([["glob-parent", "5.1.2"],
                                               ["is-glob", "4.0.3"]])}]])],
  ["global-modules",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/global_modules__1.0.0__a45225d0/",
             packageDependencies: new Map([["global-modules", "1.0.0"],
                                             ["global-prefix", "1.0.2"],
                                             ["is-windows", "1.0.2"],
                                             ["resolve-dir", "1.0.1"]])}],
             ["2.0.0",
             {
               packageLocation: "/home/cons/.esy/source/i/global_modules__2.0.0__621aad0e/",
               packageDependencies: new Map([["global-modules", "2.0.0"],
                                               ["global-prefix", "3.0.0"]])}]])],
  ["global-prefix",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/global_prefix__1.0.2__7ff1d031/",
             packageDependencies: new Map([["expand-tilde", "2.0.2"],
                                             ["global-prefix", "1.0.2"],
                                             ["homedir-polyfill", "1.0.3"],
                                             ["ini", "1.3.8"],
                                             ["is-windows", "1.0.2"],
                                             ["which", "1.3.1"]])}],
             ["3.0.0",
             {
               packageLocation: "/home/cons/.esy/source/i/global_prefix__3.0.0__6989d4d5/",
               packageDependencies: new Map([["global-prefix", "3.0.0"],
                                               ["ini", "1.3.8"],
                                               ["kind-of", "6.0.3"],
                                               ["which", "1.3.1"]])}]])],
  ["globby",
  new Map([["6.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/globby__6.1.0__40b54b4c/",
             packageDependencies: new Map([["array-union", "1.0.2"],
                                             ["glob", "7.2.2"],
                                             ["globby", "6.1.0"],
                                             ["object-assign", "4.1.1"],
                                             ["pify", "2.3.0"],
                                             ["pinkie-promise", "2.0.1"]])}],
             ["7.1.1",
             {
               packageLocation: "/home/cons/.esy/source/i/globby__7.1.1__23ffa78f/",
               packageDependencies: new Map([["array-union", "1.0.2"],
                                               ["dir-glob", "2.2.2"],
                                               ["glob", "7.2.2"],
                                               ["globby", "7.1.1"],
                                               ["ignore", "3.3.10"],
                                               ["pify", "3.0.0"],
                                               ["slash", "1.0.0"]])}]])],
  ["graceful-fs",
  new Map([["4.2.10",
           {
             packageLocation: "/home/cons/.esy/source/i/graceful_fs__4.2.10__ecba3630/",
             packageDependencies: new Map([["graceful-fs", "4.2.10"]])}]])],
  ["handle-thing",
  new Map([["2.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/handle_thing__2.0.1__d8728e08/",
             packageDependencies: new Map([["handle-thing", "2.0.1"]])}]])],
  ["has",
  new Map([["1.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/has__1.0.3__79b9f05d/",
             packageDependencies: new Map([["function-bind", "1.1.1"],
                                             ["has", "1.0.3"]])}]])],
  ["has-bigints",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/has_bigints__1.0.2__4d65ab66/",
             packageDependencies: new Map([["has-bigints", "1.0.2"]])}]])],
  ["has-flag",
  new Map([["3.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/has_flag__3.0.0__058d2bde/",
             packageDependencies: new Map([["has-flag", "3.0.0"]])}]])],
  ["has-property-descriptors",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/has_property_descriptors__1.0.0__8426e6cc/",
             packageDependencies: new Map([["get-intrinsic", "1.1.1"],
                                             ["has-property-descriptors",
                                             "1.0.0"]])}]])],
  ["has-symbols",
  new Map([["1.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/has_symbols__1.0.3__c534f6bf/",
             packageDependencies: new Map([["has-symbols", "1.0.3"]])}]])],
  ["has-tostringtag",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/has_tostringtag__1.0.0__1509a087/",
             packageDependencies: new Map([["has-symbols", "1.0.3"],
                                             ["has-tostringtag", "1.0.0"]])}]])],
  ["has-value",
  new Map([["0.3.1",
           {
             packageLocation: "/home/cons/.esy/source/i/has_value__0.3.1__802ffa1f/",
             packageDependencies: new Map([["get-value", "2.0.6"],
                                             ["has-value", "0.3.1"],
                                             ["has-values", "0.1.4"],
                                             ["isobject", "2.1.0"]])}],
             ["1.0.0",
             {
               packageLocation: "/home/cons/.esy/source/i/has_value__1.0.0__6bf1e647/",
               packageDependencies: new Map([["get-value", "2.0.6"],
                                               ["has-value", "1.0.0"],
                                               ["has-values", "1.0.0"],
                                               ["isobject", "3.0.1"]])}]])],
  ["has-values",
  new Map([["0.1.4",
           {
             packageLocation: "/home/cons/.esy/source/i/has_values__0.1.4__95f0f007/",
             packageDependencies: new Map([["has-values", "0.1.4"]])}],
             ["1.0.0",
             {
               packageLocation: "/home/cons/.esy/source/i/has_values__1.0.0__f4b60ee2/",
               packageDependencies: new Map([["has-values", "1.0.0"],
                                               ["is-number", "3.0.0"],
                                               ["kind-of", "4.0.0"]])}]])],
  ["hash-base",
  new Map([["3.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/hash_base__3.1.0__a7885511/",
             packageDependencies: new Map([["hash-base", "3.1.0"],
                                             ["inherits", "2.0.4"],
                                             ["readable-stream", "3.6.0"],
                                             ["safe-buffer", "5.2.1"]])}]])],
  ["hash.js",
  new Map([["1.1.7",
           {
             packageLocation: "/home/cons/.esy/source/i/hash.js__1.1.7__4dc65e56/",
             packageDependencies: new Map([["hash.js", "1.1.7"],
                                             ["inherits", "2.0.4"],
                                             ["minimalistic-assert", "1.0.1"]])}]])],
  ["he",
  new Map([["1.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/he__1.2.0__629bc263/",
             packageDependencies: new Map([["he", "1.2.0"]])}]])],
  ["hmac-drbg",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/hmac_drbg__1.0.1__25d0c230/",
             packageDependencies: new Map([["hash.js", "1.1.7"],
                                             ["hmac-drbg", "1.0.1"],
                                             ["minimalistic-assert", "1.0.1"],
                                             ["minimalistic-crypto-utils",
                                             "1.0.1"]])}]])],
  ["homedir-polyfill",
  new Map([["1.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/homedir_polyfill__1.0.3__3506c0cc/",
             packageDependencies: new Map([["homedir-polyfill", "1.0.3"],
                                             ["parse-passwd", "1.0.0"]])}]])],
  ["hpack.js",
  new Map([["2.1.6",
           {
             packageLocation: "/home/cons/.esy/source/i/hpack.js__2.1.6__67cd288a/",
             packageDependencies: new Map([["hpack.js", "2.1.6"],
                                             ["inherits", "2.0.4"],
                                             ["obuf", "1.1.2"],
                                             ["readable-stream", "2.3.7"],
                                             ["wbuf", "1.7.3"]])}]])],
  ["html-entities",
  new Map([["1.4.0",
           {
             packageLocation: "/home/cons/.esy/source/i/html_entities__1.4.0__757dfa28/",
             packageDependencies: new Map([["html-entities", "1.4.0"]])}]])],
  ["html-minifier",
  new Map([["3.5.21",
           {
             packageLocation: "/home/cons/.esy/source/i/html_minifier__3.5.21__c173b3e9/",
             packageDependencies: new Map([["camel-case", "3.0.0"],
                                             ["clean-css", "4.2.4"],
                                             ["commander", "2.17.1"],
                                             ["he", "1.2.0"],
                                             ["html-minifier", "3.5.21"],
                                             ["param-case", "2.1.1"],
                                             ["relateurl", "0.2.7"],
                                             ["uglify-js", "3.4.10"]])}]])],
  ["html-webpack-plugin",
  new Map([["3.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/html_webpack_plugin__3.2.0__ce295689/",
             packageDependencies: new Map([["html-minifier", "3.5.21"],
                                             ["html-webpack-plugin", "3.2.0"],
                                             ["loader-utils", "0.2.17"],
                                             ["lodash", "4.17.21"],
                                             ["pretty-error", "2.1.2"],
                                             ["tapable", "1.1.3"],
                                             ["toposort", "1.0.7"],
                                             ["util.promisify", "1.0.0"],
                                             ["webpack", "4.46.0"]])}]])],
  ["htmlparser2",
  new Map([["6.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/htmlparser2__6.1.0__33645102/",
             packageDependencies: new Map([["domelementtype", "2.3.0"],
                                             ["domhandler", "4.3.1"],
                                             ["domutils", "2.8.0"],
                                             ["entities", "2.2.0"],
                                             ["htmlparser2", "6.1.0"]])}]])],
  ["http-deceiver",
  new Map([["1.2.7",
           {
             packageLocation: "/home/cons/.esy/source/i/http_deceiver__1.2.7__58bdfb4a/",
             packageDependencies: new Map([["http-deceiver", "1.2.7"]])}]])],
  ["http-errors",
  new Map([["1.6.3",
           {
             packageLocation: "/home/cons/.esy/source/i/http_errors__1.6.3__90607d9e/",
             packageDependencies: new Map([["depd", "1.1.2"],
                                             ["http-errors", "1.6.3"],
                                             ["inherits", "2.0.3"],
                                             ["setprototypeof", "1.1.0"],
                                             ["statuses", "1.5.0"]])}],
             ["2.0.0",
             {
               packageLocation: "/home/cons/.esy/source/i/http_errors__2.0.0__faeeb707/",
               packageDependencies: new Map([["depd", "2.0.0"],
                                               ["http-errors", "2.0.0"],
                                               ["inherits", "2.0.4"],
                                               ["setprototypeof", "1.2.0"],
                                               ["statuses", "2.0.1"],
                                               ["toidentifier", "1.0.1"]])}]])],
  ["http-parser-js",
  new Map([["0.5.6",
           {
             packageLocation: "/home/cons/.esy/source/i/http_parser_js__0.5.6__9c18778a/",
             packageDependencies: new Map([["http-parser-js", "0.5.6"]])}]])],
  ["http-proxy",
  new Map([["1.18.1",
           {
             packageLocation: "/home/cons/.esy/source/i/http_proxy__1.18.1__152ddd50/",
             packageDependencies: new Map([["eventemitter3", "4.0.7"],
                                             ["follow-redirects", "1.15.0"],
                                             ["http-proxy", "1.18.1"],
                                             ["requires-port", "1.0.0"]])}]])],
  ["http-proxy-middleware",
  new Map([["0.19.1",
           {
             packageLocation: "/home/cons/.esy/source/i/http_proxy_middleware__0.19.1__90845fb7/",
             packageDependencies: new Map([["http-proxy", "1.18.1"],
                                             ["http-proxy-middleware",
                                             "0.19.1"],
                                             ["is-glob", "4.0.3"],
                                             ["lodash", "4.17.21"],
                                             ["micromatch", "3.1.10"]])}]])],
  ["https-browserify",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/https_browserify__1.0.0__e1586026/",
             packageDependencies: new Map([["https-browserify", "1.0.0"]])}]])],
  ["iconv-lite",
  new Map([["0.4.24",
           {
             packageLocation: "/home/cons/.esy/source/i/iconv_lite__0.4.24__0f6d0a3e/",
             packageDependencies: new Map([["iconv-lite", "0.4.24"],
                                             ["safer-buffer", "2.1.2"]])}]])],
  ["ieee754",
  new Map([["1.2.1",
           {
             packageLocation: "/home/cons/.esy/source/i/ieee754__1.2.1__9af8fceb/",
             packageDependencies: new Map([["ieee754", "1.2.1"]])}]])],
  ["iferr",
  new Map([["0.1.5",
           {
             packageLocation: "/home/cons/.esy/source/i/iferr__0.1.5__29cfe6e7/",
             packageDependencies: new Map([["iferr", "0.1.5"]])}]])],
  ["ignore",
  new Map([["3.3.10",
           {
             packageLocation: "/home/cons/.esy/source/i/ignore__3.3.10__67a5951d/",
             packageDependencies: new Map([["ignore", "3.3.10"]])}]])],
  ["import-local",
  new Map([["2.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/import_local__2.0.0__3ccd2e5a/",
             packageDependencies: new Map([["import-local", "2.0.0"],
                                             ["pkg-dir", "3.0.0"],
                                             ["resolve-cwd", "2.0.0"]])}]])],
  ["imurmurhash",
  new Map([["0.1.4",
           {
             packageLocation: "/home/cons/.esy/source/i/imurmurhash__0.1.4__1fc42006/",
             packageDependencies: new Map([["imurmurhash", "0.1.4"]])}]])],
  ["infer-owner",
  new Map([["1.0.4",
           {
             packageLocation: "/home/cons/.esy/source/i/infer_owner__1.0.4__b668b087/",
             packageDependencies: new Map([["infer-owner", "1.0.4"]])}]])],
  ["inflight",
  new Map([["1.0.6",
           {
             packageLocation: "/home/cons/.esy/source/i/inflight__1.0.6__5ef09bf2/",
             packageDependencies: new Map([["inflight", "1.0.6"],
                                             ["once", "1.4.0"],
                                             ["wrappy", "1.0.2"]])}]])],
  ["inherits",
  new Map([["2.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/inherits__2.0.1__5e13f6eb/",
             packageDependencies: new Map([["inherits", "2.0.1"]])}],
             ["2.0.3",
             {
               packageLocation: "/home/cons/.esy/source/i/inherits__2.0.3__e91f0785/",
               packageDependencies: new Map([["inherits", "2.0.3"]])}],
             ["2.0.4",
             {
               packageLocation: "/home/cons/.esy/source/i/inherits__2.0.4__5ce658b5/",
               packageDependencies: new Map([["inherits", "2.0.4"]])}]])],
  ["ini",
  new Map([["1.3.8",
           {
             packageLocation: "/home/cons/.esy/source/i/ini__1.3.8__340372ca/",
             packageDependencies: new Map([["ini", "1.3.8"]])}]])],
  ["internal-ip",
  new Map([["4.3.0",
           {
             packageLocation: "/home/cons/.esy/source/i/internal_ip__4.3.0__33fb4e47/",
             packageDependencies: new Map([["default-gateway", "4.2.0"],
                                             ["internal-ip", "4.3.0"],
                                             ["ipaddr.js", "1.9.1"]])}]])],
  ["internal-slot",
  new Map([["1.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/internal_slot__1.0.3__d29b7c8d/",
             packageDependencies: new Map([["get-intrinsic", "1.1.1"],
                                             ["has", "1.0.3"],
                                             ["internal-slot", "1.0.3"],
                                             ["side-channel", "1.0.4"]])}]])],
  ["interpret",
  new Map([["1.4.0",
           {
             packageLocation: "/home/cons/.esy/source/i/interpret__1.4.0__096e01d6/",
             packageDependencies: new Map([["interpret", "1.4.0"]])}]])],
  ["ip",
  new Map([["1.1.8",
           {
             packageLocation: "/home/cons/.esy/source/i/ip__1.1.8__71f1d814/",
             packageDependencies: new Map([["ip", "1.1.8"]])}]])],
  ["ip-regex",
  new Map([["2.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/ip_regex__2.1.0__5e630305/",
             packageDependencies: new Map([["ip-regex", "2.1.0"]])}]])],
  ["ipaddr.js",
  new Map([["1.9.1",
           {
             packageLocation: "/home/cons/.esy/source/i/ipaddr.js__1.9.1__32a5fafd/",
             packageDependencies: new Map([["ipaddr.js", "1.9.1"]])}]])],
  ["is-absolute-url",
  new Map([["3.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/is_absolute_url__3.0.3__51d7c368/",
             packageDependencies: new Map([["is-absolute-url", "3.0.3"]])}]])],
  ["is-accessor-descriptor",
  new Map([["0.1.6",
           {
             packageLocation: "/home/cons/.esy/source/i/is_accessor_descriptor__0.1.6__892d8573/",
             packageDependencies: new Map([["is-accessor-descriptor",
                                           "0.1.6"],
                                             ["kind-of", "3.2.2"]])}],
             ["1.0.0",
             {
               packageLocation: "/home/cons/.esy/source/i/is_accessor_descriptor__1.0.0__108888c1/",
               packageDependencies: new Map([["is-accessor-descriptor",
                                             "1.0.0"],
                                               ["kind-of", "6.0.3"]])}]])],
  ["is-arguments",
  new Map([["1.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/is_arguments__1.1.1__224bd1dd/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["has-tostringtag", "1.0.0"],
                                             ["is-arguments", "1.1.1"]])}]])],
  ["is-bigint",
  new Map([["1.0.4",
           {
             packageLocation: "/home/cons/.esy/source/i/is_bigint__1.0.4__dfe9f921/",
             packageDependencies: new Map([["has-bigints", "1.0.2"],
                                             ["is-bigint", "1.0.4"]])}]])],
  ["is-binary-path",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/is_binary_path__1.0.1__569b061f/",
             packageDependencies: new Map([["binary-extensions", "1.13.1"],
                                             ["is-binary-path", "1.0.1"]])}],
             ["2.1.0",
             {
               packageLocation: "/home/cons/.esy/source/i/is_binary_path__2.1.0__15ac85d3/",
               packageDependencies: new Map([["binary-extensions", "2.2.0"],
                                               ["is-binary-path", "2.1.0"]])}]])],
  ["is-boolean-object",
  new Map([["1.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/is_boolean_object__1.1.2__e596cd56/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["has-tostringtag", "1.0.0"],
                                             ["is-boolean-object", "1.1.2"]])}]])],
  ["is-buffer",
  new Map([["1.1.6",
           {
             packageLocation: "/home/cons/.esy/source/i/is_buffer__1.1.6__f9508fd1/",
             packageDependencies: new Map([["is-buffer", "1.1.6"]])}]])],
  ["is-callable",
  new Map([["1.2.4",
           {
             packageLocation: "/home/cons/.esy/source/i/is_callable__1.2.4__8b9db246/",
             packageDependencies: new Map([["is-callable", "1.2.4"]])}]])],
  ["is-data-descriptor",
  new Map([["0.1.4",
           {
             packageLocation: "/home/cons/.esy/source/i/is_data_descriptor__0.1.4__79d141c0/",
             packageDependencies: new Map([["is-data-descriptor", "0.1.4"],
                                             ["kind-of", "3.2.2"]])}],
             ["1.0.0",
             {
               packageLocation: "/home/cons/.esy/source/i/is_data_descriptor__1.0.0__45e804c7/",
               packageDependencies: new Map([["is-data-descriptor", "1.0.0"],
                                               ["kind-of", "6.0.3"]])}]])],
  ["is-date-object",
  new Map([["1.0.5",
           {
             packageLocation: "/home/cons/.esy/source/i/is_date_object__1.0.5__5dc73cf7/",
             packageDependencies: new Map([["has-tostringtag", "1.0.0"],
                                             ["is-date-object", "1.0.5"]])}]])],
  ["is-descriptor",
  new Map([["0.1.6",
           {
             packageLocation: "/home/cons/.esy/source/i/is_descriptor__0.1.6__e33f1b8b/",
             packageDependencies: new Map([["is-accessor-descriptor",
                                           "0.1.6"],
                                             ["is-data-descriptor", "0.1.4"],
                                             ["is-descriptor", "0.1.6"],
                                             ["kind-of", "5.1.0"]])}],
             ["1.0.2",
             {
               packageLocation: "/home/cons/.esy/source/i/is_descriptor__1.0.2__9886fab7/",
               packageDependencies: new Map([["is-accessor-descriptor",
                                             "1.0.0"],
                                               ["is-data-descriptor",
                                               "1.0.0"],
                                               ["is-descriptor", "1.0.2"],
                                               ["kind-of", "6.0.3"]])}]])],
  ["is-extendable",
  new Map([["0.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/is_extendable__0.1.1__660e53d4/",
             packageDependencies: new Map([["is-extendable", "0.1.1"]])}],
             ["1.0.1",
             {
               packageLocation: "/home/cons/.esy/source/i/is_extendable__1.0.1__42926f00/",
               packageDependencies: new Map([["is-extendable", "1.0.1"],
                                               ["is-plain-object", "2.0.4"]])}]])],
  ["is-extglob",
  new Map([["2.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/is_extglob__2.1.1__8fa4f21a/",
             packageDependencies: new Map([["is-extglob", "2.1.1"]])}]])],
  ["is-fullwidth-code-point",
  new Map([["2.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/is_fullwidth_code_point__2.0.0__3d7ff1c2/",
             packageDependencies: new Map([["is-fullwidth-code-point",
                                           "2.0.0"]])}]])],
  ["is-glob",
  new Map([["3.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/is_glob__3.1.0__8ead7f75/",
             packageDependencies: new Map([["is-extglob", "2.1.1"],
                                             ["is-glob", "3.1.0"]])}],
             ["4.0.3",
             {
               packageLocation: "/home/cons/.esy/source/i/is_glob__4.0.3__76072e4e/",
               packageDependencies: new Map([["is-extglob", "2.1.1"],
                                               ["is-glob", "4.0.3"]])}]])],
  ["is-negative-zero",
  new Map([["2.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/is_negative_zero__2.0.2__db4fde0d/",
             packageDependencies: new Map([["is-negative-zero", "2.0.2"]])}]])],
  ["is-number",
  new Map([["3.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/is_number__3.0.0__46772964/",
             packageDependencies: new Map([["is-number", "3.0.0"],
                                             ["kind-of", "3.2.2"]])}],
             ["7.0.0",
             {
               packageLocation: "/home/cons/.esy/source/i/is_number__7.0.0__e3bfa7e2/",
               packageDependencies: new Map([["is-number", "7.0.0"]])}]])],
  ["is-number-object",
  new Map([["1.0.7",
           {
             packageLocation: "/home/cons/.esy/source/i/is_number_object__1.0.7__6c51eba3/",
             packageDependencies: new Map([["has-tostringtag", "1.0.0"],
                                             ["is-number-object", "1.0.7"]])}]])],
  ["is-path-cwd",
  new Map([["2.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/is_path_cwd__2.2.0__c94f01a7/",
             packageDependencies: new Map([["is-path-cwd", "2.2.0"]])}]])],
  ["is-path-in-cwd",
  new Map([["2.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/is_path_in_cwd__2.1.0__5853d7b6/",
             packageDependencies: new Map([["is-path-in-cwd", "2.1.0"],
                                             ["is-path-inside", "2.1.0"]])}]])],
  ["is-path-inside",
  new Map([["2.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/is_path_inside__2.1.0__b2679405/",
             packageDependencies: new Map([["is-path-inside", "2.1.0"],
                                             ["path-is-inside", "1.0.2"]])}]])],
  ["is-plain-object",
  new Map([["2.0.4",
           {
             packageLocation: "/home/cons/.esy/source/i/is_plain_object__2.0.4__50413263/",
             packageDependencies: new Map([["is-plain-object", "2.0.4"],
                                             ["isobject", "3.0.1"]])}]])],
  ["is-regex",
  new Map([["1.1.4",
           {
             packageLocation: "/home/cons/.esy/source/i/is_regex__1.1.4__9d8b5c4d/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["has-tostringtag", "1.0.0"],
                                             ["is-regex", "1.1.4"]])}]])],
  ["is-shared-array-buffer",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/is_shared_array_buffer__1.0.2__6df40dee/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["is-shared-array-buffer",
                                             "1.0.2"]])}]])],
  ["is-stream",
  new Map([["1.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/is_stream__1.1.0__808b4cab/",
             packageDependencies: new Map([["is-stream", "1.1.0"]])}]])],
  ["is-string",
  new Map([["1.0.7",
           {
             packageLocation: "/home/cons/.esy/source/i/is_string__1.0.7__2aad9466/",
             packageDependencies: new Map([["has-tostringtag", "1.0.0"],
                                             ["is-string", "1.0.7"]])}]])],
  ["is-symbol",
  new Map([["1.0.4",
           {
             packageLocation: "/home/cons/.esy/source/i/is_symbol__1.0.4__11fb5c86/",
             packageDependencies: new Map([["has-symbols", "1.0.3"],
                                             ["is-symbol", "1.0.4"]])}]])],
  ["is-weakref",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/is_weakref__1.0.2__43ec266e/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["is-weakref", "1.0.2"]])}]])],
  ["is-windows",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/is_windows__1.0.2__e09f5a28/",
             packageDependencies: new Map([["is-windows", "1.0.2"]])}]])],
  ["is-wsl",
  new Map([["1.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/is_wsl__1.1.0__50f4ef2c/",
             packageDependencies: new Map([["is-wsl", "1.1.0"]])}]])],
  ["isarray",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/isarray__1.0.0__6cecb641/",
             packageDependencies: new Map([["isarray", "1.0.0"]])}]])],
  ["isexe",
  new Map([["2.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/isexe__2.0.0__01c1de49/",
             packageDependencies: new Map([["isexe", "2.0.0"]])}]])],
  ["isobject",
  new Map([["2.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/isobject__2.1.0__b1b028ee/",
             packageDependencies: new Map([["isarray", "1.0.0"],
                                             ["isobject", "2.1.0"]])}],
             ["3.0.1",
             {
               packageLocation: "/home/cons/.esy/source/i/isobject__3.0.1__892637c7/",
               packageDependencies: new Map([["isobject", "3.0.1"]])}]])],
  ["js-tokens",
  new Map([["4.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/js_tokens__4.0.0__13c348c2/",
             packageDependencies: new Map([["js-tokens", "4.0.0"]])}]])],
  ["json-parse-better-errors",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/json_parse_better_errors__1.0.2__c798f0f1/",
             packageDependencies: new Map([["json-parse-better-errors",
                                           "1.0.2"]])}]])],
  ["json-schema-traverse",
  new Map([["0.4.1",
           {
             packageLocation: "/home/cons/.esy/source/i/json_schema_traverse__0.4.1__43d23351/",
             packageDependencies: new Map([["json-schema-traverse", "0.4.1"]])}]])],
  ["json5",
  new Map([["0.5.1",
           {
             packageLocation: "/home/cons/.esy/source/i/json5__0.5.1__441adc8d/",
             packageDependencies: new Map([["json5", "0.5.1"]])}],
             ["1.0.1",
             {
               packageLocation: "/home/cons/.esy/source/i/json5__1.0.1__d92fd0aa/",
               packageDependencies: new Map([["json5", "1.0.1"],
                                               ["minimist", "1.2.6"]])}]])],
  ["killable",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/killable__1.0.1__51e89aa5/",
             packageDependencies: new Map([["killable", "1.0.1"]])}]])],
  ["kind-of",
  new Map([["3.2.2",
           {
             packageLocation: "/home/cons/.esy/source/i/kind_of__3.2.2__d01f6796/",
             packageDependencies: new Map([["is-buffer", "1.1.6"],
                                             ["kind-of", "3.2.2"]])}],
             ["4.0.0",
             {
               packageLocation: "/home/cons/.esy/source/i/kind_of__4.0.0__db2bf5e3/",
               packageDependencies: new Map([["is-buffer", "1.1.6"],
                                               ["kind-of", "4.0.0"]])}],
             ["5.1.0",
             {
               packageLocation: "/home/cons/.esy/source/i/kind_of__5.1.0__d39d9bfc/",
               packageDependencies: new Map([["kind-of", "5.1.0"]])}],
             ["6.0.3",
             {
               packageLocation: "/home/cons/.esy/source/i/kind_of__6.0.3__5e3ab80e/",
               packageDependencies: new Map([["kind-of", "6.0.3"]])}]])],
  ["loader-runner",
  new Map([["2.4.0",
           {
             packageLocation: "/home/cons/.esy/source/i/loader_runner__2.4.0__575b6473/",
             packageDependencies: new Map([["loader-runner", "2.4.0"]])}]])],
  ["loader-utils",
  new Map([["0.2.17",
           {
             packageLocation: "/home/cons/.esy/source/i/loader_utils__0.2.17__2b09d9dc/",
             packageDependencies: new Map([["big.js", "3.2.0"],
                                             ["emojis-list", "2.1.0"],
                                             ["json5", "0.5.1"],
                                             ["loader-utils", "0.2.17"],
                                             ["object-assign", "4.1.1"]])}],
             ["1.4.0",
             {
               packageLocation: "/home/cons/.esy/source/i/loader_utils__1.4.0__9a8c1a30/",
               packageDependencies: new Map([["big.js", "5.2.2"],
                                               ["emojis-list", "3.0.0"],
                                               ["json5", "1.0.1"],
                                               ["loader-utils", "1.4.0"]])}]])],
  ["locate-path",
  new Map([["3.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/locate_path__3.0.0__c82eae75/",
             packageDependencies: new Map([["locate-path", "3.0.0"],
                                             ["p-locate", "3.0.0"],
                                             ["path-exists", "3.0.0"]])}]])],
  ["lodash",
  new Map([["4.17.21",
           {
             packageLocation: "/home/cons/.esy/source/i/lodash__4.17.21__82c45c9d/",
             packageDependencies: new Map([["lodash", "4.17.21"]])}]])],
  ["loglevel",
  new Map([["1.8.0",
           {
             packageLocation: "/home/cons/.esy/source/i/loglevel__1.8.0__b43cdb18/",
             packageDependencies: new Map([["loglevel", "1.8.0"]])}]])],
  ["loose-envify",
  new Map([["1.4.0",
           {
             packageLocation: "/home/cons/.esy/source/i/loose_envify__1.4.0__f4d87f47/",
             packageDependencies: new Map([["js-tokens", "4.0.0"],
                                             ["loose-envify", "1.4.0"]])}]])],
  ["lower-case",
  new Map([["1.1.4",
           {
             packageLocation: "/home/cons/.esy/source/i/lower_case__1.1.4__cb495517/",
             packageDependencies: new Map([["lower-case", "1.1.4"]])}]])],
  ["lru-cache",
  new Map([["5.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/lru_cache__5.1.1__ee5ec39d/",
             packageDependencies: new Map([["lru-cache", "5.1.1"],
                                             ["yallist", "3.1.1"]])}]])],
  ["make-dir",
  new Map([["2.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/make_dir__2.1.0__37198ffc/",
             packageDependencies: new Map([["make-dir", "2.1.0"],
                                             ["pify", "4.0.1"],
                                             ["semver", "5.7.1"]])}]])],
  ["map-cache",
  new Map([["0.2.2",
           {
             packageLocation: "/home/cons/.esy/source/i/map_cache__0.2.2__ae144545/",
             packageDependencies: new Map([["map-cache", "0.2.2"]])}]])],
  ["map-visit",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/map_visit__1.0.0__b55d6613/",
             packageDependencies: new Map([["map-visit", "1.0.0"],
                                             ["object-visit", "1.0.1"]])}]])],
  ["md5.js",
  new Map([["1.3.5",
           {
             packageLocation: "/home/cons/.esy/source/i/md5.js__1.3.5__b94d1b25/",
             packageDependencies: new Map([["hash-base", "3.1.0"],
                                             ["inherits", "2.0.4"],
                                             ["md5.js", "1.3.5"],
                                             ["safe-buffer", "5.2.1"]])}]])],
  ["media-typer",
  new Map([["0.3.0",
           {
             packageLocation: "/home/cons/.esy/source/i/media_typer__0.3.0__75b8861a/",
             packageDependencies: new Map([["media-typer", "0.3.0"]])}]])],
  ["memory-fs",
  new Map([["0.4.1",
           {
             packageLocation: "/home/cons/.esy/source/i/memory_fs__0.4.1__14f0fac8/",
             packageDependencies: new Map([["errno", "0.1.8"],
                                             ["memory-fs", "0.4.1"],
                                             ["readable-stream", "2.3.7"]])}],
             ["0.5.0",
             {
               packageLocation: "/home/cons/.esy/source/i/memory_fs__0.5.0__2811f54b/",
               packageDependencies: new Map([["errno", "0.1.8"],
                                               ["memory-fs", "0.5.0"],
                                               ["readable-stream", "2.3.7"]])}]])],
  ["merge-descriptors",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/merge_descriptors__1.0.1__abd45ddb/",
             packageDependencies: new Map([["merge-descriptors", "1.0.1"]])}]])],
  ["methods",
  new Map([["1.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/methods__1.1.2__77ef1275/",
             packageDependencies: new Map([["methods", "1.1.2"]])}]])],
  ["micromatch",
  new Map([["3.1.10",
           {
             packageLocation: "/home/cons/.esy/source/i/micromatch__3.1.10__4fdec659/",
             packageDependencies: new Map([["arr-diff", "4.0.0"],
                                             ["array-unique", "0.3.2"],
                                             ["braces", "2.3.2"],
                                             ["define-property", "2.0.2"],
                                             ["extend-shallow", "3.0.2"],
                                             ["extglob", "2.0.4"],
                                             ["fragment-cache", "0.2.1"],
                                             ["kind-of", "6.0.3"],
                                             ["micromatch", "3.1.10"],
                                             ["nanomatch", "1.2.13"],
                                             ["object.pick", "1.3.0"],
                                             ["regex-not", "1.0.2"],
                                             ["snapdragon", "0.8.2"],
                                             ["to-regex", "3.0.2"]])}]])],
  ["miller-rabin",
  new Map([["4.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/miller_rabin__4.0.1__93ba3590/",
             packageDependencies: new Map([["bn.js", "4.12.0"],
                                             ["brorand", "1.1.0"],
                                             ["miller-rabin", "4.0.1"]])}]])],
  ["mime",
  new Map([["1.6.0",
           {
             packageLocation: "/home/cons/.esy/source/i/mime__1.6.0__34cfdcf1/",
             packageDependencies: new Map([["mime", "1.6.0"]])}],
             ["2.6.0",
             {
               packageLocation: "/home/cons/.esy/source/i/mime__2.6.0__332f196b/",
               packageDependencies: new Map([["mime", "2.6.0"]])}]])],
  ["mime-db",
  new Map([["1.52.0",
           {
             packageLocation: "/home/cons/.esy/source/i/mime_db__1.52.0__95b55558/",
             packageDependencies: new Map([["mime-db", "1.52.0"]])}]])],
  ["mime-types",
  new Map([["2.1.35",
           {
             packageLocation: "/home/cons/.esy/source/i/mime_types__2.1.35__ba4679a9/",
             packageDependencies: new Map([["mime-db", "1.52.0"],
                                             ["mime-types", "2.1.35"]])}]])],
  ["minimalistic-assert",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/minimalistic_assert__1.0.1__2c7fc03f/",
             packageDependencies: new Map([["minimalistic-assert", "1.0.1"]])}]])],
  ["minimalistic-crypto-utils",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/minimalistic_crypto_utils__1.0.1__bb94be3f/",
             packageDependencies: new Map([["minimalistic-crypto-utils",
                                           "1.0.1"]])}]])],
  ["minimatch",
  new Map([["3.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/minimatch__3.1.2__4b853d7d/",
             packageDependencies: new Map([["brace-expansion", "1.1.11"],
                                             ["minimatch", "3.1.2"]])}]])],
  ["minimist",
  new Map([["1.2.6",
           {
             packageLocation: "/home/cons/.esy/source/i/minimist__1.2.6__0c34a6c6/",
             packageDependencies: new Map([["minimist", "1.2.6"]])}]])],
  ["mississippi",
  new Map([["3.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/mississippi__3.0.0__6f1efb4f/",
             packageDependencies: new Map([["concat-stream", "1.6.2"],
                                             ["duplexify", "3.7.1"],
                                             ["end-of-stream", "1.4.4"],
                                             ["flush-write-stream", "1.1.1"],
                                             ["from2", "2.3.0"],
                                             ["mississippi", "3.0.0"],
                                             ["parallel-transform", "1.2.0"],
                                             ["pump", "3.0.0"],
                                             ["pumpify", "1.5.1"],
                                             ["stream-each", "1.2.3"],
                                             ["through2", "2.0.5"]])}]])],
  ["mixin-deep",
  new Map([["1.3.2",
           {
             packageLocation: "/home/cons/.esy/source/i/mixin_deep__1.3.2__57627b76/",
             packageDependencies: new Map([["for-in", "1.0.2"],
                                             ["is-extendable", "1.0.1"],
                                             ["mixin-deep", "1.3.2"]])}]])],
  ["mkdirp",
  new Map([["0.5.6",
           {
             packageLocation: "/home/cons/.esy/source/i/mkdirp__0.5.6__8ae93b8b/",
             packageDependencies: new Map([["minimist", "1.2.6"],
                                             ["mkdirp", "0.5.6"]])}]])],
  ["move-concurrently",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/move_concurrently__1.0.1__1e184273/",
             packageDependencies: new Map([["aproba", "1.2.0"],
                                             ["copy-concurrently", "1.0.5"],
                                             ["fs-write-stream-atomic",
                                             "1.0.10"],
                                             ["mkdirp", "0.5.6"],
                                             ["move-concurrently", "1.0.1"],
                                             ["rimraf", "2.7.1"],
                                             ["run-queue", "1.0.3"]])}]])],
  ["ms",
  new Map([["2.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/ms__2.0.0__d842b4cd/",
             packageDependencies: new Map([["ms", "2.0.0"]])}],
             ["2.1.2",
             {
               packageLocation: "/home/cons/.esy/source/i/ms__2.1.2__44bf868b/",
               packageDependencies: new Map([["ms", "2.1.2"]])}],
             ["2.1.3",
             {
               packageLocation: "/home/cons/.esy/source/i/ms__2.1.3__e0e23969/",
               packageDependencies: new Map([["ms", "2.1.3"]])}]])],
  ["multicast-dns",
  new Map([["6.2.3",
           {
             packageLocation: "/home/cons/.esy/source/i/multicast_dns__6.2.3__46468492/",
             packageDependencies: new Map([["dns-packet", "1.3.4"],
                                             ["multicast-dns", "6.2.3"],
                                             ["thunky", "1.1.0"]])}]])],
  ["multicast-dns-service-types",
  new Map([["1.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/multicast_dns_service_types__1.1.0__2b89e1c8/",
             packageDependencies: new Map([["multicast-dns-service-types",
                                           "1.1.0"]])}]])],
  ["nan",
  new Map([["2.15.0",
           {
             packageLocation: "/home/cons/.esy/source/i/nan__2.15.0__00a89088/",
             packageDependencies: new Map([["nan", "2.15.0"]])}]])],
  ["nanomatch",
  new Map([["1.2.13",
           {
             packageLocation: "/home/cons/.esy/source/i/nanomatch__1.2.13__2a566370/",
             packageDependencies: new Map([["arr-diff", "4.0.0"],
                                             ["array-unique", "0.3.2"],
                                             ["define-property", "2.0.2"],
                                             ["extend-shallow", "3.0.2"],
                                             ["fragment-cache", "0.2.1"],
                                             ["is-windows", "1.0.2"],
                                             ["kind-of", "6.0.3"],
                                             ["nanomatch", "1.2.13"],
                                             ["object.pick", "1.3.0"],
                                             ["regex-not", "1.0.2"],
                                             ["snapdragon", "0.8.2"],
                                             ["to-regex", "3.0.2"]])}]])],
  ["negotiator",
  new Map([["0.6.3",
           {
             packageLocation: "/home/cons/.esy/source/i/negotiator__0.6.3__8ce50151/",
             packageDependencies: new Map([["negotiator", "0.6.3"]])}]])],
  ["neo-async",
  new Map([["2.6.2",
           {
             packageLocation: "/home/cons/.esy/source/i/neo_async__2.6.2__0b3d63e9/",
             packageDependencies: new Map([["neo-async", "2.6.2"]])}]])],
  ["nice-try",
  new Map([["1.0.5",
           {
             packageLocation: "/home/cons/.esy/source/i/nice_try__1.0.5__f4f1d459/",
             packageDependencies: new Map([["nice-try", "1.0.5"]])}]])],
  ["no-case",
  new Map([["2.3.2",
           {
             packageLocation: "/home/cons/.esy/source/i/no_case__2.3.2__9b45b5cb/",
             packageDependencies: new Map([["lower-case", "1.1.4"],
                                             ["no-case", "2.3.2"]])}]])],
  ["node-forge",
  new Map([["0.10.0",
           {
             packageLocation: "/home/cons/.esy/source/i/node_forge__0.10.0__ad5d33b4/",
             packageDependencies: new Map([["node-forge", "0.10.0"]])}]])],
  ["node-libs-browser",
  new Map([["2.2.1",
           {
             packageLocation: "/home/cons/.esy/source/i/node_libs_browser__2.2.1__3ce66953/",
             packageDependencies: new Map([["assert", "1.5.0"],
                                             ["browserify-zlib", "0.2.0"],
                                             ["buffer", "4.9.2"],
                                             ["console-browserify", "1.2.0"],
                                             ["constants-browserify",
                                             "1.0.0"],
                                             ["crypto-browserify", "3.12.0"],
                                             ["domain-browser", "1.2.0"],
                                             ["events", "3.3.0"],
                                             ["https-browserify", "1.0.0"],
                                             ["node-libs-browser", "2.2.1"],
                                             ["os-browserify", "0.3.0"],
                                             ["path-browserify", "0.0.1"],
                                             ["process", "0.11.10"],
                                             ["punycode", "1.4.1"],
                                             ["querystring-es3", "0.2.1"],
                                             ["readable-stream", "2.3.7"],
                                             ["stream-browserify", "2.0.2"],
                                             ["stream-http", "2.8.3"],
                                             ["string_decoder", "1.3.0"],
                                             ["timers-browserify", "2.0.12"],
                                             ["tty-browserify", "0.0.0"],
                                             ["url", "0.11.0"],
                                             ["util", "0.11.1"],
                                             ["vm-browserify", "1.1.2"]])}]])],
  ["normalize-path",
  new Map([["2.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/normalize_path__2.1.1__baf85fb0/",
             packageDependencies: new Map([["normalize-path", "2.1.1"],
                                             ["remove-trailing-separator",
                                             "1.1.0"]])}],
             ["3.0.0",
             {
               packageLocation: "/home/cons/.esy/source/i/normalize_path__3.0.0__91fa1ad9/",
               packageDependencies: new Map([["normalize-path", "3.0.0"]])}]])],
  ["npm-run-path",
  new Map([["2.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/npm_run_path__2.0.2__12ea0e5b/",
             packageDependencies: new Map([["npm-run-path", "2.0.2"],
                                             ["path-key", "2.0.1"]])}]])],
  ["nth-check",
  new Map([["2.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/nth_check__2.0.1__1a7390b1/",
             packageDependencies: new Map([["boolbase", "1.0.0"],
                                             ["nth-check", "2.0.1"]])}]])],
  ["object-assign",
  new Map([["4.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/object_assign__4.1.1__c3b8f00e/",
             packageDependencies: new Map([["object-assign", "4.1.1"]])}]])],
  ["object-copy",
  new Map([["0.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/object_copy__0.1.0__b1fa7896/",
             packageDependencies: new Map([["copy-descriptor", "0.1.1"],
                                             ["define-property", "0.2.5"],
                                             ["kind-of", "3.2.2"],
                                             ["object-copy", "0.1.0"]])}]])],
  ["object-inspect",
  new Map([["1.12.0",
           {
             packageLocation: "/home/cons/.esy/source/i/object_inspect__1.12.0__de610b4e/",
             packageDependencies: new Map([["object-inspect", "1.12.0"]])}]])],
  ["object-is",
  new Map([["1.1.5",
           {
             packageLocation: "/home/cons/.esy/source/i/object_is__1.1.5__38e88932/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["define-properties", "1.1.4"],
                                             ["object-is", "1.1.5"]])}]])],
  ["object-keys",
  new Map([["1.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/object_keys__1.1.1__f0b86008/",
             packageDependencies: new Map([["object-keys", "1.1.1"]])}]])],
  ["object-visit",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/object_visit__1.0.1__c60c875c/",
             packageDependencies: new Map([["isobject", "3.0.1"],
                                             ["object-visit", "1.0.1"]])}]])],
  ["object.assign",
  new Map([["4.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/object.assign__4.1.2__9a6eb629/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["define-properties", "1.1.4"],
                                             ["has-symbols", "1.0.3"],
                                             ["object-keys", "1.1.1"],
                                             ["object.assign", "4.1.2"]])}]])],
  ["object.getownpropertydescriptors",
  new Map([["2.1.3",
           {
             packageLocation: "/home/cons/.esy/source/i/object.getownpropertydescriptors__2.1.3__c230e13a/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["define-properties", "1.1.4"],
                                             ["es-abstract", "1.20.0"],
                                             ["object.getownpropertydescriptors",
                                             "2.1.3"]])}]])],
  ["object.pick",
  new Map([["1.3.0",
           {
             packageLocation: "/home/cons/.esy/source/i/object.pick__1.3.0__723792f2/",
             packageDependencies: new Map([["isobject", "3.0.1"],
                                             ["object.pick", "1.3.0"]])}]])],
  ["obuf",
  new Map([["1.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/obuf__1.1.2__18753518/",
             packageDependencies: new Map([["obuf", "1.1.2"]])}]])],
  ["on-finished",
  new Map([["2.4.1",
           {
             packageLocation: "/home/cons/.esy/source/i/on_finished__2.4.1__b6dfaa81/",
             packageDependencies: new Map([["ee-first", "1.1.1"],
                                             ["on-finished", "2.4.1"]])}]])],
  ["on-headers",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/on_headers__1.0.2__9f8e2b09/",
             packageDependencies: new Map([["on-headers", "1.0.2"]])}]])],
  ["once",
  new Map([["1.4.0",
           {
             packageLocation: "/home/cons/.esy/source/i/once__1.4.0__8285ddde/",
             packageDependencies: new Map([["once", "1.4.0"],
                                             ["wrappy", "1.0.2"]])}]])],
  ["opn",
  new Map([["5.5.0",
           {
             packageLocation: "/home/cons/.esy/source/i/opn__5.5.0__b6db4769/",
             packageDependencies: new Map([["is-wsl", "1.1.0"],
                                             ["opn", "5.5.0"]])}]])],
  ["original",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/original__1.0.2__37580bec/",
             packageDependencies: new Map([["original", "1.0.2"],
                                             ["url-parse", "1.5.10"]])}]])],
  ["os-browserify",
  new Map([["0.3.0",
           {
             packageLocation: "/home/cons/.esy/source/i/os_browserify__0.3.0__bc69e2ab/",
             packageDependencies: new Map([["os-browserify", "0.3.0"]])}]])],
  ["p-finally",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/p_finally__1.0.0__90840028/",
             packageDependencies: new Map([["p-finally", "1.0.0"]])}]])],
  ["p-limit",
  new Map([["2.3.0",
           {
             packageLocation: "/home/cons/.esy/source/i/p_limit__2.3.0__cfa3bb23/",
             packageDependencies: new Map([["p-limit", "2.3.0"],
                                             ["p-try", "2.2.0"]])}]])],
  ["p-locate",
  new Map([["3.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/p_locate__3.0.0__af40b806/",
             packageDependencies: new Map([["p-limit", "2.3.0"],
                                             ["p-locate", "3.0.0"]])}]])],
  ["p-map",
  new Map([["2.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/p_map__2.1.0__58743574/",
             packageDependencies: new Map([["p-map", "2.1.0"]])}]])],
  ["p-retry",
  new Map([["3.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/p_retry__3.0.1__f0fab947/",
             packageDependencies: new Map([["p-retry", "3.0.1"],
                                             ["retry", "0.12.0"]])}]])],
  ["p-try",
  new Map([["2.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/p_try__2.2.0__7ec98f05/",
             packageDependencies: new Map([["p-try", "2.2.0"]])}]])],
  ["pako",
  new Map([["1.0.11",
           {
             packageLocation: "/home/cons/.esy/source/i/pako__1.0.11__b0db269f/",
             packageDependencies: new Map([["pako", "1.0.11"]])}]])],
  ["parallel-transform",
  new Map([["1.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/parallel_transform__1.2.0__19ce6b17/",
             packageDependencies: new Map([["cyclist", "1.0.1"],
                                             ["inherits", "2.0.3"],
                                             ["parallel-transform", "1.2.0"],
                                             ["readable-stream", "2.3.7"]])}]])],
  ["param-case",
  new Map([["2.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/param_case__2.1.1__6a899fd8/",
             packageDependencies: new Map([["no-case", "2.3.2"],
                                             ["param-case", "2.1.1"]])}]])],
  ["parse-asn1",
  new Map([["5.1.6",
           {
             packageLocation: "/home/cons/.esy/source/i/parse_asn1__5.1.6__8c27fee2/",
             packageDependencies: new Map([["asn1.js", "5.4.1"],
                                             ["browserify-aes", "1.2.0"],
                                             ["evp_bytestokey", "1.0.3"],
                                             ["parse-asn1", "5.1.6"],
                                             ["pbkdf2", "3.1.2"],
                                             ["safe-buffer", "5.2.1"]])}]])],
  ["parse-passwd",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/parse_passwd__1.0.0__d45a497e/",
             packageDependencies: new Map([["parse-passwd", "1.0.0"]])}]])],
  ["parseurl",
  new Map([["1.3.3",
           {
             packageLocation: "/home/cons/.esy/source/i/parseurl__1.3.3__256f617c/",
             packageDependencies: new Map([["parseurl", "1.3.3"]])}]])],
  ["pascalcase",
  new Map([["0.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/pascalcase__0.1.1__dbba0370/",
             packageDependencies: new Map([["pascalcase", "0.1.1"]])}]])],
  ["path-browserify",
  new Map([["0.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/path_browserify__0.0.1__cd5acb46/",
             packageDependencies: new Map([["path-browserify", "0.0.1"]])}]])],
  ["path-dirname",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/path_dirname__1.0.2__a788cae1/",
             packageDependencies: new Map([["path-dirname", "1.0.2"]])}]])],
  ["path-exists",
  new Map([["3.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/path_exists__3.0.0__bfccc3ac/",
             packageDependencies: new Map([["path-exists", "3.0.0"]])}]])],
  ["path-is-absolute",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/path_is_absolute__1.0.1__b16551ae/",
             packageDependencies: new Map([["path-is-absolute", "1.0.1"]])}]])],
  ["path-is-inside",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/path_is_inside__1.0.2__4ae12a5f/",
             packageDependencies: new Map([["path-is-inside", "1.0.2"]])}]])],
  ["path-key",
  new Map([["2.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/path_key__2.0.1__b1422758/",
             packageDependencies: new Map([["path-key", "2.0.1"]])}]])],
  ["path-to-regexp",
  new Map([["0.1.7",
           {
             packageLocation: "/home/cons/.esy/source/i/path_to_regexp__0.1.7__3fc67f9b/",
             packageDependencies: new Map([["path-to-regexp", "0.1.7"]])}]])],
  ["path-type",
  new Map([["3.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/path_type__3.0.0__8834cba1/",
             packageDependencies: new Map([["path-type", "3.0.0"],
                                             ["pify", "3.0.0"]])}]])],
  ["pbkdf2",
  new Map([["3.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/pbkdf2__3.1.2__96fb3fc1/",
             packageDependencies: new Map([["create-hash", "1.2.0"],
                                             ["create-hmac", "1.1.7"],
                                             ["pbkdf2", "3.1.2"],
                                             ["ripemd160", "2.0.2"],
                                             ["safe-buffer", "5.2.1"],
                                             ["sha.js", "2.4.11"]])}]])],
  ["picomatch",
  new Map([["2.3.1",
           {
             packageLocation: "/home/cons/.esy/source/i/picomatch__2.3.1__4699f5fc/",
             packageDependencies: new Map([["picomatch", "2.3.1"]])}]])],
  ["pify",
  new Map([["2.3.0",
           {
             packageLocation: "/home/cons/.esy/source/i/pify__2.3.0__06d913b2/",
             packageDependencies: new Map([["pify", "2.3.0"]])}],
             ["3.0.0",
             {
               packageLocation: "/home/cons/.esy/source/i/pify__3.0.0__84d68ebe/",
               packageDependencies: new Map([["pify", "3.0.0"]])}],
             ["4.0.1",
             {
               packageLocation: "/home/cons/.esy/source/i/pify__4.0.1__8980fe74/",
               packageDependencies: new Map([["pify", "4.0.1"]])}]])],
  ["pinkie",
  new Map([["2.0.4",
           {
             packageLocation: "/home/cons/.esy/source/i/pinkie__2.0.4__951bb610/",
             packageDependencies: new Map([["pinkie", "2.0.4"]])}]])],
  ["pinkie-promise",
  new Map([["2.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/pinkie_promise__2.0.1__45e23aff/",
             packageDependencies: new Map([["pinkie", "2.0.4"],
                                             ["pinkie-promise", "2.0.1"]])}]])],
  ["pkg-dir",
  new Map([["3.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/pkg_dir__3.0.0__8332d1f5/",
             packageDependencies: new Map([["find-up", "3.0.0"],
                                             ["pkg-dir", "3.0.0"]])}]])],
  ["portfinder",
  new Map([["1.0.28",
           {
             packageLocation: "/home/cons/.esy/source/i/portfinder__1.0.28__0c222b95/",
             packageDependencies: new Map([["async", "2.6.4"],
                                             ["debug", "3.2.7"],
                                             ["mkdirp", "0.5.6"],
                                             ["portfinder", "1.0.28"]])}]])],
  ["posix-character-classes",
  new Map([["0.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/posix_character_classes__0.1.1__c9261503/",
             packageDependencies: new Map([["posix-character-classes",
                                           "0.1.1"]])}]])],
  ["pretty-error",
  new Map([["2.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/pretty_error__2.1.2__b6faf5d3/",
             packageDependencies: new Map([["lodash", "4.17.21"],
                                             ["pretty-error", "2.1.2"],
                                             ["renderkid", "2.0.7"]])}]])],
  ["process",
  new Map([["0.11.10",
           {
             packageLocation: "/home/cons/.esy/source/i/process__0.11.10__8dc68528/",
             packageDependencies: new Map([["process", "0.11.10"]])}]])],
  ["process-nextick-args",
  new Map([["2.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/process_nextick_args__2.0.1__f8d0a41d/",
             packageDependencies: new Map([["process-nextick-args", "2.0.1"]])}]])],
  ["promise-inflight",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/promise_inflight__1.0.1__ea14d504/",
             packageDependencies: new Map([["promise-inflight", "1.0.1"]])}]])],
  ["prop-types",
  new Map([["15.8.1",
           {
             packageLocation: "/home/cons/.esy/source/i/prop_types__15.8.1__fddb6b9e/",
             packageDependencies: new Map([["loose-envify", "1.4.0"],
                                             ["object-assign", "4.1.1"],
                                             ["prop-types", "15.8.1"],
                                             ["react-is", "16.13.1"]])}]])],
  ["proxy-addr",
  new Map([["2.0.7",
           {
             packageLocation: "/home/cons/.esy/source/i/proxy_addr__2.0.7__66a754ca/",
             packageDependencies: new Map([["forwarded", "0.2.0"],
                                             ["ipaddr.js", "1.9.1"],
                                             ["proxy-addr", "2.0.7"]])}]])],
  ["prr",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/prr__1.0.1__b9a75d0f/",
             packageDependencies: new Map([["prr", "1.0.1"]])}]])],
  ["public-encrypt",
  new Map([["4.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/public_encrypt__4.0.3__f123f55f/",
             packageDependencies: new Map([["bn.js", "4.12.0"],
                                             ["browserify-rsa", "4.1.0"],
                                             ["create-hash", "1.2.0"],
                                             ["parse-asn1", "5.1.6"],
                                             ["public-encrypt", "4.0.3"],
                                             ["randombytes", "2.1.0"],
                                             ["safe-buffer", "5.2.1"]])}]])],
  ["pump",
  new Map([["2.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/pump__2.0.1__6ac1ae9f/",
             packageDependencies: new Map([["end-of-stream", "1.4.4"],
                                             ["once", "1.4.0"],
                                             ["pump", "2.0.1"]])}],
             ["3.0.0",
             {
               packageLocation: "/home/cons/.esy/source/i/pump__3.0.0__650a87ec/",
               packageDependencies: new Map([["end-of-stream", "1.4.4"],
                                               ["once", "1.4.0"],
                                               ["pump", "3.0.0"]])}]])],
  ["pumpify",
  new Map([["1.5.1",
           {
             packageLocation: "/home/cons/.esy/source/i/pumpify__1.5.1__b8cd67d5/",
             packageDependencies: new Map([["duplexify", "3.7.1"],
                                             ["inherits", "2.0.3"],
                                             ["pump", "2.0.1"],
                                             ["pumpify", "1.5.1"]])}]])],
  ["punycode",
  new Map([["1.3.2",
           {
             packageLocation: "/home/cons/.esy/source/i/punycode__1.3.2__ac5b0bb8/",
             packageDependencies: new Map([["punycode", "1.3.2"]])}],
             ["1.4.1",
             {
               packageLocation: "/home/cons/.esy/source/i/punycode__1.4.1__fa9c3784/",
               packageDependencies: new Map([["punycode", "1.4.1"]])}],
             ["2.1.1",
             {
               packageLocation: "/home/cons/.esy/source/i/punycode__2.1.1__9d5f3bb8/",
               packageDependencies: new Map([["punycode", "2.1.1"]])}]])],
  ["qs",
  new Map([["6.10.3",
           {
             packageLocation: "/home/cons/.esy/source/i/qs__6.10.3__33420d87/",
             packageDependencies: new Map([["qs", "6.10.3"],
                                             ["side-channel", "1.0.4"]])}]])],
  ["querystring",
  new Map([["0.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/querystring__0.2.0__9ea05f59/",
             packageDependencies: new Map([["querystring", "0.2.0"]])}]])],
  ["querystring-es3",
  new Map([["0.2.1",
           {
             packageLocation: "/home/cons/.esy/source/i/querystring_es3__0.2.1__d5a8c196/",
             packageDependencies: new Map([["querystring-es3", "0.2.1"]])}]])],
  ["querystringify",
  new Map([["2.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/querystringify__2.2.0__9b263494/",
             packageDependencies: new Map([["querystringify", "2.2.0"]])}]])],
  ["randombytes",
  new Map([["2.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/randombytes__2.1.0__4558ce74/",
             packageDependencies: new Map([["randombytes", "2.1.0"],
                                             ["safe-buffer", "5.2.1"]])}]])],
  ["randomfill",
  new Map([["1.0.4",
           {
             packageLocation: "/home/cons/.esy/source/i/randomfill__1.0.4__9ca5fe09/",
             packageDependencies: new Map([["randombytes", "2.1.0"],
                                             ["randomfill", "1.0.4"],
                                             ["safe-buffer", "5.2.1"]])}]])],
  ["range-parser",
  new Map([["1.2.1",
           {
             packageLocation: "/home/cons/.esy/source/i/range_parser__1.2.1__bbb82e6e/",
             packageDependencies: new Map([["range-parser", "1.2.1"]])}]])],
  ["raw-body",
  new Map([["2.5.1",
           {
             packageLocation: "/home/cons/.esy/source/i/raw_body__2.5.1__a8ba5c24/",
             packageDependencies: new Map([["bytes", "3.1.2"],
                                             ["http-errors", "2.0.0"],
                                             ["iconv-lite", "0.4.24"],
                                             ["raw-body", "2.5.1"],
                                             ["unpipe", "1.0.0"]])}]])],
  ["rawbones",
  new Map([["0.3.5",
           {
             packageLocation: "/home/cons/.esy/source/i/rawbones__0.3.5__23b1331b/",
             packageDependencies: new Map([["@glennsl/bs-json", "5.0.4"],
                                             ["rawbones", "0.3.5"]])}]])],
  ["react",
  new Map([["16.14.0",
           {
             packageLocation: "/home/cons/.esy/source/i/react__16.14.0__ccc04f20/",
             packageDependencies: new Map([["loose-envify", "1.4.0"],
                                             ["object-assign", "4.1.1"],
                                             ["prop-types", "15.8.1"],
                                             ["react", "16.14.0"]])}]])],
  ["react-dom",
  new Map([["16.14.0",
           {
             packageLocation: "/home/cons/.esy/source/i/react_dom__16.14.0__27c5fac7/",
             packageDependencies: new Map([["loose-envify", "1.4.0"],
                                             ["object-assign", "4.1.1"],
                                             ["prop-types", "15.8.1"],
                                             ["react", "16.14.0"],
                                             ["react-dom", "16.14.0"],
                                             ["scheduler", "0.19.1"]])}]])],
  ["react-is",
  new Map([["16.13.1",
           {
             packageLocation: "/home/cons/.esy/source/i/react_is__16.13.1__8a41bdd9/",
             packageDependencies: new Map([["react-is", "16.13.1"]])}]])],
  ["readable-stream",
  new Map([["2.3.7",
           {
             packageLocation: "/home/cons/.esy/source/i/readable_stream__2.3.7__2e4a050e/",
             packageDependencies: new Map([["core-util-is", "1.0.3"],
                                             ["inherits", "2.0.4"],
                                             ["isarray", "1.0.0"],
                                             ["process-nextick-args",
                                             "2.0.1"],
                                             ["readable-stream", "2.3.7"],
                                             ["safe-buffer", "5.1.2"],
                                             ["string_decoder", "1.1.1"],
                                             ["util-deprecate", "1.0.2"]])}],
             ["3.6.0",
             {
               packageLocation: "/home/cons/.esy/source/i/readable_stream__3.6.0__2016d93c/",
               packageDependencies: new Map([["inherits", "2.0.4"],
                                               ["readable-stream", "3.6.0"],
                                               ["string_decoder", "1.1.1"],
                                               ["util-deprecate", "1.0.2"]])}]])],
  ["readdirp",
  new Map([["2.2.1",
           {
             packageLocation: "/home/cons/.esy/source/i/readdirp__2.2.1__89790727/",
             packageDependencies: new Map([["graceful-fs", "4.2.10"],
                                             ["micromatch", "3.1.10"],
                                             ["readable-stream", "2.3.7"],
                                             ["readdirp", "2.2.1"]])}],
             ["3.6.0",
             {
               packageLocation: "/home/cons/.esy/source/i/readdirp__3.6.0__254ac303/",
               packageDependencies: new Map([["picomatch", "2.3.1"],
                                               ["readdirp", "3.6.0"]])}]])],
  ["reason-react",
  new Map([["0.9.1",
           {
             packageLocation: "/home/cons/.esy/source/i/reason_react__0.9.1__d0ebedb2/",
             packageDependencies: new Map([["react", "16.14.0"],
                                             ["react-dom", "16.14.0"],
                                             ["reason-react", "0.9.1"]])}]])],
  ["regex-not",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/regex_not__1.0.2__9a76c75b/",
             packageDependencies: new Map([["extend-shallow", "3.0.2"],
                                             ["regex-not", "1.0.2"],
                                             ["safe-regex", "1.1.0"]])}]])],
  ["regexp.prototype.flags",
  new Map([["1.4.3",
           {
             packageLocation: "/home/cons/.esy/source/i/regexp.prototype.flags__1.4.3__8d1910e2/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["define-properties", "1.1.4"],
                                             ["functions-have-names",
                                             "1.2.3"],
                                             ["regexp.prototype.flags",
                                             "1.4.3"]])}]])],
  ["relateurl",
  new Map([["0.2.7",
           {
             packageLocation: "/home/cons/.esy/source/i/relateurl__0.2.7__44e61415/",
             packageDependencies: new Map([["relateurl", "0.2.7"]])}]])],
  ["remove-trailing-separator",
  new Map([["1.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/remove_trailing_separator__1.1.0__5afd3399/",
             packageDependencies: new Map([["remove-trailing-separator",
                                           "1.1.0"]])}]])],
  ["renderkid",
  new Map([["2.0.7",
           {
             packageLocation: "/home/cons/.esy/source/i/renderkid__2.0.7__371a205f/",
             packageDependencies: new Map([["css-select", "4.3.0"],
                                             ["dom-converter", "0.2.0"],
                                             ["htmlparser2", "6.1.0"],
                                             ["lodash", "4.17.21"],
                                             ["renderkid", "2.0.7"],
                                             ["strip-ansi", "3.0.1"]])}]])],
  ["repeat-element",
  new Map([["1.1.4",
           {
             packageLocation: "/home/cons/.esy/source/i/repeat_element__1.1.4__cce94694/",
             packageDependencies: new Map([["repeat-element", "1.1.4"]])}]])],
  ["repeat-string",
  new Map([["1.6.1",
           {
             packageLocation: "/home/cons/.esy/source/i/repeat_string__1.6.1__f30c8ba7/",
             packageDependencies: new Map([["repeat-string", "1.6.1"]])}]])],
  ["require-directory",
  new Map([["2.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/require_directory__2.1.1__263c7201/",
             packageDependencies: new Map([["require-directory", "2.1.1"]])}]])],
  ["require-main-filename",
  new Map([["2.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/require_main_filename__2.0.0__86f489be/",
             packageDependencies: new Map([["require-main-filename", "2.0.0"]])}]])],
  ["requires-port",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/requires_port__1.0.0__3ad550f6/",
             packageDependencies: new Map([["requires-port", "1.0.0"]])}]])],
  ["resolve-cwd",
  new Map([["2.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/resolve_cwd__2.0.0__55a80a72/",
             packageDependencies: new Map([["resolve-cwd", "2.0.0"],
                                             ["resolve-from", "3.0.0"]])}]])],
  ["resolve-dir",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/resolve_dir__1.0.1__c0d22834/",
             packageDependencies: new Map([["expand-tilde", "2.0.2"],
                                             ["global-modules", "1.0.0"],
                                             ["resolve-dir", "1.0.1"]])}]])],
  ["resolve-from",
  new Map([["3.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/resolve_from__3.0.0__c1a314d9/",
             packageDependencies: new Map([["resolve-from", "3.0.0"]])}]])],
  ["resolve-url",
  new Map([["0.2.1",
           {
             packageLocation: "/home/cons/.esy/source/i/resolve_url__0.2.1__a6983901/",
             packageDependencies: new Map([["resolve-url", "0.2.1"]])}]])],
  ["ret",
  new Map([["0.1.15",
           {
             packageLocation: "/home/cons/.esy/source/i/ret__0.1.15__017183c7/",
             packageDependencies: new Map([["ret", "0.1.15"]])}]])],
  ["retry",
  new Map([["0.12.0",
           {
             packageLocation: "/home/cons/.esy/source/i/retry__0.12.0__1b311d7f/",
             packageDependencies: new Map([["retry", "0.12.0"]])}]])],
  ["rimraf",
  new Map([["2.7.1",
           {
             packageLocation: "/home/cons/.esy/source/i/rimraf__2.7.1__e0994486/",
             packageDependencies: new Map([["glob", "7.2.2"],
                                             ["rimraf", "2.7.1"]])}]])],
  ["ripemd160",
  new Map([["2.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/ripemd160__2.0.2__d2570416/",
             packageDependencies: new Map([["hash-base", "3.1.0"],
                                             ["inherits", "2.0.4"],
                                             ["ripemd160", "2.0.2"]])}]])],
  ["run-queue",
  new Map([["1.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/run_queue__1.0.3__4810c051/",
             packageDependencies: new Map([["aproba", "1.2.0"],
                                             ["run-queue", "1.0.3"]])}]])],
  ["safe-buffer",
  new Map([["5.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/safe_buffer__5.1.2__e975ebd3/",
             packageDependencies: new Map([["safe-buffer", "5.1.2"]])}],
             ["5.2.1",
             {
               packageLocation: "/home/cons/.esy/source/i/safe_buffer__5.2.1__4598fe14/",
               packageDependencies: new Map([["safe-buffer", "5.2.1"]])}]])],
  ["safe-regex",
  new Map([["1.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/safe_regex__1.1.0__ffc1efdf/",
             packageDependencies: new Map([["ret", "0.1.15"],
                                             ["safe-regex", "1.1.0"]])}]])],
  ["safer-buffer",
  new Map([["2.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/safer_buffer__2.1.2__204e3826/",
             packageDependencies: new Map([["safer-buffer", "2.1.2"]])}]])],
  ["scheduler",
  new Map([["0.19.1",
           {
             packageLocation: "/home/cons/.esy/source/i/scheduler__0.19.1__f23c7769/",
             packageDependencies: new Map([["loose-envify", "1.4.0"],
                                             ["object-assign", "4.1.1"],
                                             ["scheduler", "0.19.1"]])}]])],
  ["schema-utils",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/schema_utils__1.0.0__141ba8e4/",
             packageDependencies: new Map([["ajv", "6.12.6"],
                                             ["ajv-errors", "1.0.1"],
                                             ["ajv-keywords", "3.5.2"],
                                             ["schema-utils", "1.0.0"]])}]])],
  ["select-hose",
  new Map([["2.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/select_hose__2.0.0__f7d5440a/",
             packageDependencies: new Map([["select-hose", "2.0.0"]])}]])],
  ["selfsigned",
  new Map([["1.10.14",
           {
             packageLocation: "/home/cons/.esy/source/i/selfsigned__1.10.14__56fc38d6/",
             packageDependencies: new Map([["node-forge", "0.10.0"],
                                             ["selfsigned", "1.10.14"]])}]])],
  ["semver",
  new Map([["5.7.1",
           {
             packageLocation: "/home/cons/.esy/source/i/semver__5.7.1__e3fff838/",
             packageDependencies: new Map([["semver", "5.7.1"]])}],
             ["6.3.0",
             {
               packageLocation: "/home/cons/.esy/source/i/semver__6.3.0__fb45cafd/",
               packageDependencies: new Map([["semver", "6.3.0"]])}]])],
  ["send",
  new Map([["0.18.0",
           {
             packageLocation: "/home/cons/.esy/source/i/send__0.18.0__68382a79/",
             packageDependencies: new Map([["debug", "2.6.9"],
                                             ["depd", "2.0.0"],
                                             ["destroy", "1.2.0"],
                                             ["encodeurl", "1.0.2"],
                                             ["escape-html", "1.0.3"],
                                             ["etag", "1.8.1"],
                                             ["fresh", "0.5.2"],
                                             ["http-errors", "2.0.0"],
                                             ["mime", "1.6.0"],
                                             ["ms", "2.1.3"],
                                             ["on-finished", "2.4.1"],
                                             ["range-parser", "1.2.1"],
                                             ["send", "0.18.0"],
                                             ["statuses", "2.0.1"]])}]])],
  ["serialize-javascript",
  new Map([["4.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/serialize_javascript__4.0.0__12aeabb6/",
             packageDependencies: new Map([["randombytes", "2.1.0"],
                                             ["serialize-javascript",
                                             "4.0.0"]])}]])],
  ["serve-index",
  new Map([["1.9.1",
           {
             packageLocation: "/home/cons/.esy/source/i/serve_index__1.9.1__897d748e/",
             packageDependencies: new Map([["accepts", "1.3.8"],
                                             ["batch", "0.6.1"],
                                             ["debug", "2.6.9"],
                                             ["escape-html", "1.0.3"],
                                             ["http-errors", "1.6.3"],
                                             ["mime-types", "2.1.35"],
                                             ["parseurl", "1.3.3"],
                                             ["serve-index", "1.9.1"]])}]])],
  ["serve-static",
  new Map([["1.15.0",
           {
             packageLocation: "/home/cons/.esy/source/i/serve_static__1.15.0__3c8e8c91/",
             packageDependencies: new Map([["encodeurl", "1.0.2"],
                                             ["escape-html", "1.0.3"],
                                             ["parseurl", "1.3.3"],
                                             ["send", "0.18.0"],
                                             ["serve-static", "1.15.0"]])}]])],
  ["set-blocking",
  new Map([["2.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/set_blocking__2.0.0__5d79dd8a/",
             packageDependencies: new Map([["set-blocking", "2.0.0"]])}]])],
  ["set-value",
  new Map([["2.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/set_value__2.0.1__a2adfdf9/",
             packageDependencies: new Map([["extend-shallow", "2.0.1"],
                                             ["is-extendable", "0.1.1"],
                                             ["is-plain-object", "2.0.4"],
                                             ["set-value", "2.0.1"],
                                             ["split-string", "3.1.0"]])}]])],
  ["setimmediate",
  new Map([["1.0.5",
           {
             packageLocation: "/home/cons/.esy/source/i/setimmediate__1.0.5__b0f653d9/",
             packageDependencies: new Map([["setimmediate", "1.0.5"]])}]])],
  ["setprototypeof",
  new Map([["1.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/setprototypeof__1.1.0__f1f537fb/",
             packageDependencies: new Map([["setprototypeof", "1.1.0"]])}],
             ["1.2.0",
             {
               packageLocation: "/home/cons/.esy/source/i/setprototypeof__1.2.0__abc59022/",
               packageDependencies: new Map([["setprototypeof", "1.2.0"]])}]])],
  ["sha.js",
  new Map([["2.4.11",
           {
             packageLocation: "/home/cons/.esy/source/i/sha.js__2.4.11__4a7b275a/",
             packageDependencies: new Map([["inherits", "2.0.4"],
                                             ["safe-buffer", "5.2.1"],
                                             ["sha.js", "2.4.11"]])}]])],
  ["shebang-command",
  new Map([["1.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/shebang_command__1.2.0__d7a62977/",
             packageDependencies: new Map([["shebang-command", "1.2.0"],
                                             ["shebang-regex", "1.0.0"]])}]])],
  ["shebang-regex",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/shebang_regex__1.0.0__61c22a6d/",
             packageDependencies: new Map([["shebang-regex", "1.0.0"]])}]])],
  ["side-channel",
  new Map([["1.0.4",
           {
             packageLocation: "/home/cons/.esy/source/i/side_channel__1.0.4__2cc1fc61/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["get-intrinsic", "1.1.1"],
                                             ["object-inspect", "1.12.0"],
                                             ["side-channel", "1.0.4"]])}]])],
  ["signal-exit",
  new Map([["3.0.7",
           {
             packageLocation: "/home/cons/.esy/source/i/signal_exit__3.0.7__2427f0d9/",
             packageDependencies: new Map([["signal-exit", "3.0.7"]])}]])],
  ["slash",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/slash__1.0.0__360ced2a/",
             packageDependencies: new Map([["slash", "1.0.0"]])}]])],
  ["snapdragon",
  new Map([["0.8.2",
           {
             packageLocation: "/home/cons/.esy/source/i/snapdragon__0.8.2__3333ae58/",
             packageDependencies: new Map([["base", "0.11.2"],
                                             ["debug", "2.6.9"],
                                             ["define-property", "0.2.5"],
                                             ["extend-shallow", "2.0.1"],
                                             ["map-cache", "0.2.2"],
                                             ["snapdragon", "0.8.2"],
                                             ["source-map", "0.5.7"],
                                             ["source-map-resolve", "0.5.3"],
                                             ["use", "3.1.1"]])}]])],
  ["snapdragon-node",
  new Map([["2.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/snapdragon_node__2.1.1__389d2cbf/",
             packageDependencies: new Map([["define-property", "1.0.0"],
                                             ["isobject", "3.0.1"],
                                             ["snapdragon-node", "2.1.1"],
                                             ["snapdragon-util", "3.0.1"]])}]])],
  ["snapdragon-util",
  new Map([["3.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/snapdragon_util__3.0.1__09e35752/",
             packageDependencies: new Map([["kind-of", "3.2.2"],
                                             ["snapdragon-util", "3.0.1"]])}]])],
  ["sockjs",
  new Map([["0.3.24",
           {
             packageLocation: "/home/cons/.esy/source/i/sockjs__0.3.24__71cd2320/",
             packageDependencies: new Map([["faye-websocket", "0.11.4"],
                                             ["sockjs", "0.3.24"],
                                             ["uuid", "8.3.2"],
                                             ["websocket-driver", "0.7.4"]])}]])],
  ["sockjs-client",
  new Map([["1.6.0",
           {
             packageLocation: "/home/cons/.esy/source/i/sockjs_client__1.6.0__ec23204e/",
             packageDependencies: new Map([["debug", "3.2.7"],
                                             ["eventsource", "1.1.1"],
                                             ["faye-websocket", "0.11.4"],
                                             ["inherits", "2.0.4"],
                                             ["sockjs-client", "1.6.0"],
                                             ["url-parse", "1.5.10"]])}]])],
  ["source-list-map",
  new Map([["2.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/source_list_map__2.0.1__d5e784c2/",
             packageDependencies: new Map([["source-list-map", "2.0.1"]])}]])],
  ["source-map",
  new Map([["0.5.7",
           {
             packageLocation: "/home/cons/.esy/source/i/source_map__0.5.7__f39e7237/",
             packageDependencies: new Map([["source-map", "0.5.7"]])}],
             ["0.6.1",
             {
               packageLocation: "/home/cons/.esy/source/i/source_map__0.6.1__20131c2b/",
               packageDependencies: new Map([["source-map", "0.6.1"]])}]])],
  ["source-map-resolve",
  new Map([["0.5.3",
           {
             packageLocation: "/home/cons/.esy/source/i/source_map_resolve__0.5.3__8aba3b88/",
             packageDependencies: new Map([["atob", "2.1.2"],
                                             ["decode-uri-component",
                                             "0.2.0"],
                                             ["resolve-url", "0.2.1"],
                                             ["source-map-resolve", "0.5.3"],
                                             ["source-map-url", "0.4.1"],
                                             ["urix", "0.1.0"]])}]])],
  ["source-map-support",
  new Map([["0.5.21",
           {
             packageLocation: "/home/cons/.esy/source/i/source_map_support__0.5.21__c4490966/",
             packageDependencies: new Map([["buffer-from", "1.1.2"],
                                             ["source-map", "0.6.1"],
                                             ["source-map-support", "0.5.21"]])}]])],
  ["source-map-url",
  new Map([["0.4.1",
           {
             packageLocation: "/home/cons/.esy/source/i/source_map_url__0.4.1__b3241d85/",
             packageDependencies: new Map([["source-map-url", "0.4.1"]])}]])],
  ["spdy",
  new Map([["4.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/spdy__4.0.2__e17982c2/",
             packageDependencies: new Map([["debug", "4.3.4"],
                                             ["handle-thing", "2.0.1"],
                                             ["http-deceiver", "1.2.7"],
                                             ["select-hose", "2.0.0"],
                                             ["spdy", "4.0.2"],
                                             ["spdy-transport", "3.0.0"]])}]])],
  ["spdy-transport",
  new Map([["3.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/spdy_transport__3.0.0__86d31ec2/",
             packageDependencies: new Map([["debug", "4.3.4"],
                                             ["detect-node", "2.1.0"],
                                             ["hpack.js", "2.1.6"],
                                             ["obuf", "1.1.2"],
                                             ["readable-stream", "3.6.0"],
                                             ["spdy-transport", "3.0.0"],
                                             ["wbuf", "1.7.3"]])}]])],
  ["split-string",
  new Map([["3.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/split_string__3.1.0__ba22f226/",
             packageDependencies: new Map([["extend-shallow", "3.0.2"],
                                             ["split-string", "3.1.0"]])}]])],
  ["ssri",
  new Map([["6.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/ssri__6.0.2__5b284924/",
             packageDependencies: new Map([["figgy-pudding", "3.5.2"],
                                             ["ssri", "6.0.2"]])}]])],
  ["static-extend",
  new Map([["0.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/static_extend__0.1.2__eef8a796/",
             packageDependencies: new Map([["define-property", "0.2.5"],
                                             ["object-copy", "0.1.0"],
                                             ["static-extend", "0.1.2"]])}]])],
  ["statuses",
  new Map([["1.5.0",
           {
             packageLocation: "/home/cons/.esy/source/i/statuses__1.5.0__d1e84300/",
             packageDependencies: new Map([["statuses", "1.5.0"]])}],
             ["2.0.1",
             {
               packageLocation: "/home/cons/.esy/source/i/statuses__2.0.1__3fcf4fcd/",
               packageDependencies: new Map([["statuses", "2.0.1"]])}]])],
  ["stream-browserify",
  new Map([["2.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/stream_browserify__2.0.2__66efdbf4/",
             packageDependencies: new Map([["inherits", "2.0.4"],
                                             ["readable-stream", "2.3.7"],
                                             ["stream-browserify", "2.0.2"]])}]])],
  ["stream-each",
  new Map([["1.2.3",
           {
             packageLocation: "/home/cons/.esy/source/i/stream_each__1.2.3__c1bc321e/",
             packageDependencies: new Map([["end-of-stream", "1.4.4"],
                                             ["stream-each", "1.2.3"],
                                             ["stream-shift", "1.0.1"]])}]])],
  ["stream-http",
  new Map([["2.8.3",
           {
             packageLocation: "/home/cons/.esy/source/i/stream_http__2.8.3__09a5a405/",
             packageDependencies: new Map([["builtin-status-codes", "3.0.0"],
                                             ["inherits", "2.0.4"],
                                             ["readable-stream", "2.3.7"],
                                             ["stream-http", "2.8.3"],
                                             ["to-arraybuffer", "1.0.1"],
                                             ["xtend", "4.0.2"]])}]])],
  ["stream-shift",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/stream_shift__1.0.1__8e551aca/",
             packageDependencies: new Map([["stream-shift", "1.0.1"]])}]])],
  ["string-width",
  new Map([["3.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/string_width__3.1.0__53bcc797/",
             packageDependencies: new Map([["emoji-regex", "7.0.3"],
                                             ["is-fullwidth-code-point",
                                             "2.0.0"],
                                             ["string-width", "3.1.0"],
                                             ["strip-ansi", "5.2.0"]])}]])],
  ["string.prototype.trimend",
  new Map([["1.0.5",
           {
             packageLocation: "/home/cons/.esy/source/i/string.prototype.trimend__1.0.5__4d7593d9/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["define-properties", "1.1.4"],
                                             ["es-abstract", "1.20.0"],
                                             ["string.prototype.trimend",
                                             "1.0.5"]])}]])],
  ["string.prototype.trimstart",
  new Map([["1.0.5",
           {
             packageLocation: "/home/cons/.esy/source/i/string.prototype.trimstart__1.0.5__ab66e0e9/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["define-properties", "1.1.4"],
                                             ["es-abstract", "1.20.0"],
                                             ["string.prototype.trimstart",
                                             "1.0.5"]])}]])],
  ["string_decoder",
  new Map([["1.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/string__decoder__1.1.1__5c978813/",
             packageDependencies: new Map([["safe-buffer", "5.1.2"],
                                             ["string_decoder", "1.1.1"]])}],
             ["1.3.0",
             {
               packageLocation: "/home/cons/.esy/source/i/string__decoder__1.3.0__67179c58/",
               packageDependencies: new Map([["safe-buffer", "5.2.1"],
                                               ["string_decoder", "1.3.0"]])}]])],
  ["strip-ansi",
  new Map([["3.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/strip_ansi__3.0.1__e5c8348d/",
             packageDependencies: new Map([["ansi-regex", "2.1.1"],
                                             ["strip-ansi", "3.0.1"]])}],
             ["5.2.0",
             {
               packageLocation: "/home/cons/.esy/source/i/strip_ansi__5.2.0__36e628b8/",
               packageDependencies: new Map([["ansi-regex", "4.1.1"],
                                               ["strip-ansi", "5.2.0"]])}]])],
  ["strip-eof",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/strip_eof__1.0.0__040453c2/",
             packageDependencies: new Map([["strip-eof", "1.0.0"]])}]])],
  ["supports-color",
  new Map([["5.5.0",
           {
             packageLocation: "/home/cons/.esy/source/i/supports_color__5.5.0__0bed0829/",
             packageDependencies: new Map([["has-flag", "3.0.0"],
                                             ["supports-color", "5.5.0"]])}],
             ["6.1.0",
             {
               packageLocation: "/home/cons/.esy/source/i/supports_color__6.1.0__b84eee0f/",
               packageDependencies: new Map([["has-flag", "3.0.0"],
                                               ["supports-color", "6.1.0"]])}]])],
  ["tapable",
  new Map([["1.1.3",
           {
             packageLocation: "/home/cons/.esy/source/i/tapable__1.1.3__05d5fc57/",
             packageDependencies: new Map([["tapable", "1.1.3"]])}]])],
  ["terser",
  new Map([["4.8.0",
           {
             packageLocation: "/home/cons/.esy/source/i/terser__4.8.0__6d2cd164/",
             packageDependencies: new Map([["commander", "2.20.3"],
                                             ["source-map", "0.6.1"],
                                             ["source-map-support", "0.5.21"],
                                             ["terser", "4.8.0"]])}]])],
  ["terser-webpack-plugin",
  new Map([["1.4.5",
           {
             packageLocation: "/home/cons/.esy/source/i/terser_webpack_plugin__1.4.5__6ab60f58/",
             packageDependencies: new Map([["cacache", "12.0.4"],
                                             ["find-cache-dir", "2.1.0"],
                                             ["is-wsl", "1.1.0"],
                                             ["schema-utils", "1.0.0"],
                                             ["serialize-javascript",
                                             "4.0.0"],
                                             ["source-map", "0.6.1"],
                                             ["terser", "4.8.0"],
                                             ["terser-webpack-plugin",
                                             "1.4.5"],
                                             ["webpack", "4.46.0"],
                                             ["webpack-sources", "1.4.3"],
                                             ["worker-farm", "1.7.0"]])}]])],
  ["through2",
  new Map([["2.0.5",
           {
             packageLocation: "/home/cons/.esy/source/i/through2__2.0.5__e5affbec/",
             packageDependencies: new Map([["readable-stream", "2.3.7"],
                                             ["through2", "2.0.5"],
                                             ["xtend", "4.0.2"]])}]])],
  ["thunky",
  new Map([["1.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/thunky__1.1.0__8ec9c25e/",
             packageDependencies: new Map([["thunky", "1.1.0"]])}]])],
  ["timers-browserify",
  new Map([["2.0.12",
           {
             packageLocation: "/home/cons/.esy/source/i/timers_browserify__2.0.12__a94c4549/",
             packageDependencies: new Map([["setimmediate", "1.0.5"],
                                             ["timers-browserify", "2.0.12"]])}]])],
  ["to-arraybuffer",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/to_arraybuffer__1.0.1__2b9c3e7c/",
             packageDependencies: new Map([["to-arraybuffer", "1.0.1"]])}]])],
  ["to-object-path",
  new Map([["0.3.0",
           {
             packageLocation: "/home/cons/.esy/source/i/to_object_path__0.3.0__4e1644c7/",
             packageDependencies: new Map([["kind-of", "3.2.2"],
                                             ["to-object-path", "0.3.0"]])}]])],
  ["to-regex",
  new Map([["3.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/to_regex__3.0.2__1682d906/",
             packageDependencies: new Map([["define-property", "2.0.2"],
                                             ["extend-shallow", "3.0.2"],
                                             ["regex-not", "1.0.2"],
                                             ["safe-regex", "1.1.0"],
                                             ["to-regex", "3.0.2"]])}]])],
  ["to-regex-range",
  new Map([["2.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/to_regex_range__2.1.1__ff8c30ef/",
             packageDependencies: new Map([["is-number", "3.0.0"],
                                             ["repeat-string", "1.6.1"],
                                             ["to-regex-range", "2.1.1"]])}],
             ["5.0.1",
             {
               packageLocation: "/home/cons/.esy/source/i/to_regex_range__5.0.1__ddb0b8b0/",
               packageDependencies: new Map([["is-number", "7.0.0"],
                                               ["to-regex-range", "5.0.1"]])}]])],
  ["toidentifier",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/toidentifier__1.0.1__94400347/",
             packageDependencies: new Map([["toidentifier", "1.0.1"]])}]])],
  ["toposort",
  new Map([["1.0.7",
           {
             packageLocation: "/home/cons/.esy/source/i/toposort__1.0.7__4097e897/",
             packageDependencies: new Map([["toposort", "1.0.7"]])}]])],
  ["tty-browserify",
  new Map([["0.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/tty_browserify__0.0.0__21d4ad63/",
             packageDependencies: new Map([["tty-browserify", "0.0.0"]])}]])],
  ["type-is",
  new Map([["1.6.18",
           {
             packageLocation: "/home/cons/.esy/source/i/type_is__1.6.18__fa067d9a/",
             packageDependencies: new Map([["media-typer", "0.3.0"],
                                             ["mime-types", "2.1.35"],
                                             ["type-is", "1.6.18"]])}]])],
  ["typedarray",
  new Map([["0.0.6",
           {
             packageLocation: "/home/cons/.esy/source/i/typedarray__0.0.6__a835dd2c/",
             packageDependencies: new Map([["typedarray", "0.0.6"]])}]])],
  ["uglify-js",
  new Map([["3.4.10",
           {
             packageLocation: "/home/cons/.esy/source/i/uglify_js__3.4.10__7bbd9dcf/",
             packageDependencies: new Map([["commander", "2.19.0"],
                                             ["source-map", "0.6.1"],
                                             ["uglify-js", "3.4.10"]])}]])],
  ["unbox-primitive",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/unbox_primitive__1.0.2__0fb9cb29/",
             packageDependencies: new Map([["call-bind", "1.0.2"],
                                             ["has-bigints", "1.0.2"],
                                             ["has-symbols", "1.0.3"],
                                             ["unbox-primitive", "1.0.2"],
                                             ["which-boxed-primitive",
                                             "1.0.2"]])}]])],
  ["union-value",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/union_value__1.0.1__b1f6001d/",
             packageDependencies: new Map([["arr-union", "3.1.0"],
                                             ["get-value", "2.0.6"],
                                             ["is-extendable", "0.1.1"],
                                             ["set-value", "2.0.1"],
                                             ["union-value", "1.0.1"]])}]])],
  ["unique-filename",
  new Map([["1.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/unique_filename__1.1.1__60f7543c/",
             packageDependencies: new Map([["unique-filename", "1.1.1"],
                                             ["unique-slug", "2.0.2"]])}]])],
  ["unique-slug",
  new Map([["2.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/unique_slug__2.0.2__df832348/",
             packageDependencies: new Map([["imurmurhash", "0.1.4"],
                                             ["unique-slug", "2.0.2"]])}]])],
  ["unpipe",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/unpipe__1.0.0__ea4ca02f/",
             packageDependencies: new Map([["unpipe", "1.0.0"]])}]])],
  ["unset-value",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/unset_value__1.0.0__54969e15/",
             packageDependencies: new Map([["has-value", "0.3.1"],
                                             ["isobject", "3.0.1"],
                                             ["unset-value", "1.0.0"]])}]])],
  ["upath",
  new Map([["1.2.0",
           {
             packageLocation: "/home/cons/.esy/source/i/upath__1.2.0__ee0f9072/",
             packageDependencies: new Map([["upath", "1.2.0"]])}]])],
  ["upper-case",
  new Map([["1.1.3",
           {
             packageLocation: "/home/cons/.esy/source/i/upper_case__1.1.3__89a94b22/",
             packageDependencies: new Map([["upper-case", "1.1.3"]])}]])],
  ["uri-js",
  new Map([["4.4.1",
           {
             packageLocation: "/home/cons/.esy/source/i/uri_js__4.4.1__7918c241/",
             packageDependencies: new Map([["punycode", "2.1.1"],
                                             ["uri-js", "4.4.1"]])}]])],
  ["urix",
  new Map([["0.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/urix__0.1.0__578d889a/",
             packageDependencies: new Map([["urix", "0.1.0"]])}]])],
  ["url",
  new Map([["0.11.0",
           {
             packageLocation: "/home/cons/.esy/source/i/url__0.11.0__cf4e9a83/",
             packageDependencies: new Map([["punycode", "1.3.2"],
                                             ["querystring", "0.2.0"],
                                             ["url", "0.11.0"]])}]])],
  ["url-parse",
  new Map([["1.5.10",
           {
             packageLocation: "/home/cons/.esy/source/i/url_parse__1.5.10__347f98af/",
             packageDependencies: new Map([["querystringify", "2.2.0"],
                                             ["requires-port", "1.0.0"],
                                             ["url-parse", "1.5.10"]])}]])],
  ["use",
  new Map([["3.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/use__3.1.1__6c794d09/",
             packageDependencies: new Map([["use", "3.1.1"]])}]])],
  ["util",
  new Map([["0.10.3",
           {
             packageLocation: "/home/cons/.esy/source/i/util__0.10.3__8f567c57/",
             packageDependencies: new Map([["inherits", "2.0.1"],
                                             ["util", "0.10.3"]])}],
             ["0.11.1",
             {
               packageLocation: "/home/cons/.esy/source/i/util__0.11.1__068906b3/",
               packageDependencies: new Map([["inherits", "2.0.3"],
                                               ["util", "0.11.1"]])}]])],
  ["util-deprecate",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/util_deprecate__1.0.2__a0f4c1b2/",
             packageDependencies: new Map([["util-deprecate", "1.0.2"]])}]])],
  ["util.promisify",
  new Map([["1.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/util.promisify__1.0.0__f3047ed8/",
             packageDependencies: new Map([["define-properties", "1.1.4"],
                                             ["object.getownpropertydescriptors",
                                             "2.1.3"],
                                             ["util.promisify", "1.0.0"]])}]])],
  ["utila",
  new Map([["0.4.0",
           {
             packageLocation: "/home/cons/.esy/source/i/utila__0.4.0__c83be81d/",
             packageDependencies: new Map([["utila", "0.4.0"]])}]])],
  ["utils-merge",
  new Map([["1.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/utils_merge__1.0.1__a3d5ce6b/",
             packageDependencies: new Map([["utils-merge", "1.0.1"]])}]])],
  ["uuid",
  new Map([["3.4.0",
           {
             packageLocation: "/home/cons/.esy/source/i/uuid__3.4.0__aded8d7a/",
             packageDependencies: new Map([["uuid", "3.4.0"]])}],
             ["8.3.2",
             {
               packageLocation: "/home/cons/.esy/source/i/uuid__8.3.2__f1bd352f/",
               packageDependencies: new Map([["uuid", "8.3.2"]])}]])],
  ["v8-compile-cache",
  new Map([["2.3.0",
           {
             packageLocation: "/home/cons/.esy/source/i/v8_compile_cache__2.3.0__d6237e0a/",
             packageDependencies: new Map([["v8-compile-cache", "2.3.0"]])}]])],
  ["vary",
  new Map([["1.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/vary__1.1.2__3c2ea1ba/",
             packageDependencies: new Map([["vary", "1.1.2"]])}]])],
  ["vm-browserify",
  new Map([["1.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/vm_browserify__1.1.2__7810c8f8/",
             packageDependencies: new Map([["vm-browserify", "1.1.2"]])}]])],
  ["watchpack",
  new Map([["1.7.5",
           {
             packageLocation: "/home/cons/.esy/source/i/watchpack__1.7.5__ddcab962/",
             packageDependencies: new Map([["chokidar", "3.5.3"],
                                             ["graceful-fs", "4.2.10"],
                                             ["neo-async", "2.6.2"],
                                             ["watchpack", "1.7.5"],
                                             ["watchpack-chokidar2", "2.0.1"]])}]])],
  ["watchpack-chokidar2",
  new Map([["2.0.1",
           {
             packageLocation: "/home/cons/.esy/source/i/watchpack_chokidar2__2.0.1__fae2d747/",
             packageDependencies: new Map([["chokidar", "2.1.8"],
                                             ["watchpack-chokidar2", "2.0.1"]])}]])],
  ["wbuf",
  new Map([["1.7.3",
           {
             packageLocation: "/home/cons/.esy/source/i/wbuf__1.7.3__67e2e9a2/",
             packageDependencies: new Map([["minimalistic-assert", "1.0.1"],
                                             ["wbuf", "1.7.3"]])}]])],
  ["webpack",
  new Map([["4.46.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webpack__4.46.0__9508be9f/",
             packageDependencies: new Map([["@webassemblyjs/ast", "1.9.0"],
                                             ["@webassemblyjs/helper-module-context",
                                             "1.9.0"],
                                             ["@webassemblyjs/wasm-edit",
                                             "1.9.0"],
                                             ["@webassemblyjs/wasm-parser",
                                             "1.9.0"],
                                             ["acorn", "6.4.2"],
                                             ["ajv", "6.12.6"],
                                             ["ajv-keywords", "3.5.2"],
                                             ["chrome-trace-event", "1.0.3"],
                                             ["enhanced-resolve", "4.5.0"],
                                             ["eslint-scope", "4.0.3"],
                                             ["json-parse-better-errors",
                                             "1.0.2"],
                                             ["loader-runner", "2.4.0"],
                                             ["loader-utils", "1.4.0"],
                                             ["memory-fs", "0.4.1"],
                                             ["micromatch", "3.1.10"],
                                             ["mkdirp", "0.5.6"],
                                             ["neo-async", "2.6.2"],
                                             ["node-libs-browser", "2.2.1"],
                                             ["schema-utils", "1.0.0"],
                                             ["tapable", "1.1.3"],
                                             ["terser-webpack-plugin",
                                             "1.4.5"],
                                             ["watchpack", "1.7.5"],
                                             ["webpack", "4.46.0"],
                                             ["webpack-sources", "1.4.3"]])}]])],
  ["webpack-cli",
  new Map([["3.3.12",
           {
             packageLocation: "/home/cons/.esy/source/i/webpack_cli__3.3.12__4fc89bd2/",
             packageDependencies: new Map([["chalk", "2.4.2"],
                                             ["cross-spawn", "6.0.5"],
                                             ["enhanced-resolve", "4.5.0"],
                                             ["findup-sync", "3.0.0"],
                                             ["global-modules", "2.0.0"],
                                             ["import-local", "2.0.0"],
                                             ["interpret", "1.4.0"],
                                             ["loader-utils", "1.4.0"],
                                             ["supports-color", "6.1.0"],
                                             ["v8-compile-cache", "2.3.0"],
                                             ["webpack", "4.46.0"],
                                             ["webpack-cli", "3.3.12"],
                                             ["yargs", "13.3.2"]])}]])],
  ["webpack-dev-middleware",
  new Map([["3.7.3",
           {
             packageLocation: "/home/cons/.esy/source/i/webpack_dev_middleware__3.7.3__e06556e1/",
             packageDependencies: new Map([["memory-fs", "0.4.1"],
                                             ["mime", "2.6.0"],
                                             ["mkdirp", "0.5.6"],
                                             ["range-parser", "1.2.1"],
                                             ["webpack", "4.46.0"],
                                             ["webpack-dev-middleware",
                                             "3.7.3"],
                                             ["webpack-log", "2.0.0"]])}]])],
  ["webpack-dev-server",
  new Map([["3.11.3",
           {
             packageLocation: "/home/cons/.esy/source/i/webpack_dev_server__3.11.3__234f47c2/",
             packageDependencies: new Map([["ansi-html-community", "0.0.8"],
                                             ["bonjour", "3.5.0"],
                                             ["chokidar", "2.1.8"],
                                             ["compression", "1.7.4"],
                                             ["connect-history-api-fallback",
                                             "1.6.0"],
                                             ["debug", "4.3.4"],
                                             ["del", "4.1.1"],
                                             ["express", "4.18.1"],
                                             ["html-entities", "1.4.0"],
                                             ["http-proxy-middleware",
                                             "0.19.1"],
                                             ["import-local", "2.0.0"],
                                             ["internal-ip", "4.3.0"],
                                             ["ip", "1.1.8"],
                                             ["is-absolute-url", "3.0.3"],
                                             ["killable", "1.0.1"],
                                             ["loglevel", "1.8.0"],
                                             ["opn", "5.5.0"],
                                             ["p-retry", "3.0.1"],
                                             ["portfinder", "1.0.28"],
                                             ["schema-utils", "1.0.0"],
                                             ["selfsigned", "1.10.14"],
                                             ["semver", "6.3.0"],
                                             ["serve-index", "1.9.1"],
                                             ["sockjs", "0.3.24"],
                                             ["sockjs-client", "1.6.0"],
                                             ["spdy", "4.0.2"],
                                             ["strip-ansi", "3.0.1"],
                                             ["supports-color", "6.1.0"],
                                             ["url", "0.11.0"],
                                             ["webpack", "4.46.0"],
                                             ["webpack-dev-middleware",
                                             "3.7.3"],
                                             ["webpack-dev-server", "3.11.3"],
                                             ["webpack-log", "2.0.0"],
                                             ["ws", "6.2.2"],
                                             ["yargs", "13.3.2"]])}]])],
  ["webpack-log",
  new Map([["2.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/webpack_log__2.0.0__4d7a74d1/",
             packageDependencies: new Map([["ansi-colors", "3.2.4"],
                                             ["uuid", "3.4.0"],
                                             ["webpack-log", "2.0.0"]])}]])],
  ["webpack-sources",
  new Map([["1.4.3",
           {
             packageLocation: "/home/cons/.esy/source/i/webpack_sources__1.4.3__dcb5635e/",
             packageDependencies: new Map([["source-list-map", "2.0.1"],
                                             ["source-map", "0.6.1"],
                                             ["webpack-sources", "1.4.3"]])}]])],
  ["websocket-driver",
  new Map([["0.7.4",
           {
             packageLocation: "/home/cons/.esy/source/i/websocket_driver__0.7.4__75644345/",
             packageDependencies: new Map([["http-parser-js", "0.5.6"],
                                             ["safe-buffer", "5.2.1"],
                                             ["websocket-driver", "0.7.4"],
                                             ["websocket-extensions",
                                             "0.1.4"]])}]])],
  ["websocket-extensions",
  new Map([["0.1.4",
           {
             packageLocation: "/home/cons/.esy/source/i/websocket_extensions__0.1.4__621ed9c0/",
             packageDependencies: new Map([["websocket-extensions", "0.1.4"]])}]])],
  ["which",
  new Map([["1.3.1",
           {
             packageLocation: "/home/cons/.esy/source/i/which__1.3.1__6a4208c5/",
             packageDependencies: new Map([["isexe", "2.0.0"],
                                             ["which", "1.3.1"]])}]])],
  ["which-boxed-primitive",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/which_boxed_primitive__1.0.2__3437c718/",
             packageDependencies: new Map([["is-bigint", "1.0.4"],
                                             ["is-boolean-object", "1.1.2"],
                                             ["is-number-object", "1.0.7"],
                                             ["is-string", "1.0.7"],
                                             ["is-symbol", "1.0.4"],
                                             ["which-boxed-primitive",
                                             "1.0.2"]])}]])],
  ["which-module",
  new Map([["2.0.0",
           {
             packageLocation: "/home/cons/.esy/source/i/which_module__2.0.0__dbf9460d/",
             packageDependencies: new Map([["which-module", "2.0.0"]])}]])],
  ["worker-farm",
  new Map([["1.7.0",
           {
             packageLocation: "/home/cons/.esy/source/i/worker_farm__1.7.0__4e72c830/",
             packageDependencies: new Map([["errno", "0.1.8"],
                                             ["worker-farm", "1.7.0"]])}]])],
  ["wrap-ansi",
  new Map([["5.1.0",
           {
             packageLocation: "/home/cons/.esy/source/i/wrap_ansi__5.1.0__316eee6b/",
             packageDependencies: new Map([["ansi-styles", "3.2.1"],
                                             ["string-width", "3.1.0"],
                                             ["strip-ansi", "5.2.0"],
                                             ["wrap-ansi", "5.1.0"]])}]])],
  ["wrappy",
  new Map([["1.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/wrappy__1.0.2__5299ea53/",
             packageDependencies: new Map([["wrappy", "1.0.2"]])}]])],
  ["ws",
  new Map([["6.2.2",
           {
             packageLocation: "/home/cons/.esy/source/i/ws__6.2.2__f2c23f07/",
             packageDependencies: new Map([["async-limiter", "1.0.1"],
                                             ["ws", "6.2.2"]])}]])],
  ["xtend",
  new Map([["4.0.2",
           {
             packageLocation: "/home/cons/.esy/source/i/xtend__4.0.2__aa4879b6/",
             packageDependencies: new Map([["xtend", "4.0.2"]])}]])],
  ["y18n",
  new Map([["4.0.3",
           {
             packageLocation: "/home/cons/.esy/source/i/y18n__4.0.3__4dbf3ad1/",
             packageDependencies: new Map([["y18n", "4.0.3"]])}]])],
  ["yallist",
  new Map([["3.1.1",
           {
             packageLocation: "/home/cons/.esy/source/i/yallist__3.1.1__49ae508b/",
             packageDependencies: new Map([["yallist", "3.1.1"]])}]])],
  ["yargs",
  new Map([["13.3.2",
           {
             packageLocation: "/home/cons/.esy/source/i/yargs__13.3.2__2904cec0/",
             packageDependencies: new Map([["cliui", "5.0.0"],
                                             ["find-up", "3.0.0"],
                                             ["get-caller-file", "2.0.5"],
                                             ["require-directory", "2.1.1"],
                                             ["require-main-filename",
                                             "2.0.0"],
                                             ["set-blocking", "2.0.0"],
                                             ["string-width", "3.1.0"],
                                             ["which-module", "2.0.0"],
                                             ["y18n", "4.0.3"],
                                             ["yargs", "13.3.2"],
                                             ["yargs-parser", "13.1.2"]])}]])],
  ["yargs-parser",
  new Map([["13.1.2",
           {
             packageLocation: "/home/cons/.esy/source/i/yargs_parser__13.1.2__cada26e0/",
             packageDependencies: new Map([["camelcase", "5.3.1"],
                                             ["decamelize", "1.2.0"],
                                             ["yargs-parser", "13.1.2"]])}]])],
  [null,
  new Map([[null,
           {
             packageLocation: "/home/cons/projects/epiderNES/",
             packageDependencies: new Map([["bs-fetch", "0.4.0"],
                                             ["bs-platform", "8.2.0"],
                                             ["copy-webpack-plugin", "5.1.2"],
                                             ["html-webpack-plugin", "3.2.0"],
                                             ["rawbones", "0.3.5"],
                                             ["react", "16.14.0"],
                                             ["react-dom", "16.14.0"],
                                             ["reason-react", "0.9.1"],
                                             ["webpack", "4.46.0"],
                                             ["webpack-cli", "3.3.12"],
                                             ["webpack-dev-server", "3.11.3"]])}]])]]);

let topLevelLocatorPath = "../../";
let locatorsByLocations = new Map([
["../../", topLevelLocator],
  ["../../../../.esy/source/i/accepts__1.3.8__d279f1be/",
  {
    name: "accepts",
    reference: "1.3.8"}],
  ["../../../../.esy/source/i/acorn__6.4.2__3a5cdf52/",
  {
    name: "acorn",
    reference: "6.4.2"}],
  ["../../../../.esy/source/i/ajv__6.12.6__c3a69fc4/",
  {
    name: "ajv",
    reference: "6.12.6"}],
  ["../../../../.esy/source/i/ajv_errors__1.0.1__a81cbb98/",
  {
    name: "ajv-errors",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/ajv_keywords__3.5.2__7394ed1b/",
  {
    name: "ajv-keywords",
    reference: "3.5.2"}],
  ["../../../../.esy/source/i/ansi_colors__3.2.4__ba64f5b6/",
  {
    name: "ansi-colors",
    reference: "3.2.4"}],
  ["../../../../.esy/source/i/ansi_html_community__0.0.8__d3571f48/",
  {
    name: "ansi-html-community",
    reference: "0.0.8"}],
  ["../../../../.esy/source/i/ansi_regex__2.1.1__f4873edb/",
  {
    name: "ansi-regex",
    reference: "2.1.1"}],
  ["../../../../.esy/source/i/ansi_regex__4.1.1__69701333/",
  {
    name: "ansi-regex",
    reference: "4.1.1"}],
  ["../../../../.esy/source/i/ansi_styles__3.2.1__3e3790a5/",
  {
    name: "ansi-styles",
    reference: "3.2.1"}],
  ["../../../../.esy/source/i/anymatch__2.0.0__53ff378a/",
  {
    name: "anymatch",
    reference: "2.0.0"}],
  ["../../../../.esy/source/i/anymatch__3.1.2__e27270e2/",
  {
    name: "anymatch",
    reference: "3.1.2"}],
  ["../../../../.esy/source/i/aproba__1.2.0__8a61fac7/",
  {
    name: "aproba",
    reference: "1.2.0"}],
  ["../../../../.esy/source/i/arr_diff__4.0.0__5a7bbcc5/",
  {
    name: "arr-diff",
    reference: "4.0.0"}],
  ["../../../../.esy/source/i/arr_flatten__1.1.0__15a968d1/",
  {
    name: "arr-flatten",
    reference: "1.1.0"}],
  ["../../../../.esy/source/i/arr_union__3.1.0__58f07489/",
  {
    name: "arr-union",
    reference: "3.1.0"}],
  ["../../../../.esy/source/i/array_flatten__1.1.1__b411b848/",
  {
    name: "array-flatten",
    reference: "1.1.1"}],
  ["../../../../.esy/source/i/array_flatten__2.1.2__a16f8552/",
  {
    name: "array-flatten",
    reference: "2.1.2"}],
  ["../../../../.esy/source/i/array_union__1.0.2__09384b57/",
  {
    name: "array-union",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/array_uniq__1.0.3__9316bc48/",
  {
    name: "array-uniq",
    reference: "1.0.3"}],
  ["../../../../.esy/source/i/array_unique__0.3.2__ace7cbf4/",
  {
    name: "array-unique",
    reference: "0.3.2"}],
  ["../../../../.esy/source/i/asn1.js__5.4.1__26af07e2/",
  {
    name: "asn1.js",
    reference: "5.4.1"}],
  ["../../../../.esy/source/i/assert__1.5.0__1fbf1db2/",
  {
    name: "assert",
    reference: "1.5.0"}],
  ["../../../../.esy/source/i/assign_symbols__1.0.0__60f3deb0/",
  {
    name: "assign-symbols",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/async__2.6.4__d97e84f4/",
  {
    name: "async",
    reference: "2.6.4"}],
  ["../../../../.esy/source/i/async_each__1.0.3__6c87d26a/",
  {
    name: "async-each",
    reference: "1.0.3"}],
  ["../../../../.esy/source/i/async_limiter__1.0.1__b0985680/",
  {
    name: "async-limiter",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/atob__2.1.2__5aa0dbd4/",
  {
    name: "atob",
    reference: "2.1.2"}],
  ["../../../../.esy/source/i/balanced_match__1.0.2__42d32da1/",
  {
    name: "balanced-match",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/base64_js__1.5.1__ebde91fb/",
  {
    name: "base64-js",
    reference: "1.5.1"}],
  ["../../../../.esy/source/i/base__0.11.2__30052a78/",
  {
    name: "base",
    reference: "0.11.2"}],
  ["../../../../.esy/source/i/batch__0.6.1__45632b13/",
  {
    name: "batch",
    reference: "0.6.1"}],
  ["../../../../.esy/source/i/big.js__3.2.0__2998c7a6/",
  {
    name: "big.js",
    reference: "3.2.0"}],
  ["../../../../.esy/source/i/big.js__5.2.2__8283cd4a/",
  {
    name: "big.js",
    reference: "5.2.2"}],
  ["../../../../.esy/source/i/binary_extensions__1.13.1__97da917f/",
  {
    name: "binary-extensions",
    reference: "1.13.1"}],
  ["../../../../.esy/source/i/binary_extensions__2.2.0__258dd606/",
  {
    name: "binary-extensions",
    reference: "2.2.0"}],
  ["../../../../.esy/source/i/bindings__1.5.0__3b0592d3/",
  {
    name: "bindings",
    reference: "1.5.0"}],
  ["../../../../.esy/source/i/bluebird__3.7.2__d7471652/",
  {
    name: "bluebird",
    reference: "3.7.2"}],
  ["../../../../.esy/source/i/bn.js__4.12.0__8ba4195f/",
  {
    name: "bn.js",
    reference: "4.12.0"}],
  ["../../../../.esy/source/i/bn.js__5.2.0__fa402c11/",
  {
    name: "bn.js",
    reference: "5.2.0"}],
  ["../../../../.esy/source/i/body_parser__1.20.0__6120e04b/",
  {
    name: "body-parser",
    reference: "1.20.0"}],
  ["../../../../.esy/source/i/bonjour__3.5.0__e3768e45/",
  {
    name: "bonjour",
    reference: "3.5.0"}],
  ["../../../../.esy/source/i/boolbase__1.0.0__3cc1700f/",
  {
    name: "boolbase",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/brace_expansion__1.1.11__c2e362d2/",
  {
    name: "brace-expansion",
    reference: "1.1.11"}],
  ["../../../../.esy/source/i/braces__2.3.2__8146c42d/",
  {
    name: "braces",
    reference: "2.3.2"}],
  ["../../../../.esy/source/i/braces__3.0.2__5aa7ab81/",
  {
    name: "braces",
    reference: "3.0.2"}],
  ["../../../../.esy/source/i/brorand__1.1.0__d62ade09/",
  {
    name: "brorand",
    reference: "1.1.0"}],
  ["../../../../.esy/source/i/browserify_aes__1.2.0__060dc1e3/",
  {
    name: "browserify-aes",
    reference: "1.2.0"}],
  ["../../../../.esy/source/i/browserify_cipher__1.0.1__cfb1e530/",
  {
    name: "browserify-cipher",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/browserify_des__1.0.2__c76c8b44/",
  {
    name: "browserify-des",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/browserify_rsa__4.1.0__e58e6349/",
  {
    name: "browserify-rsa",
    reference: "4.1.0"}],
  ["../../../../.esy/source/i/browserify_sign__4.2.1__d6383c10/",
  {
    name: "browserify-sign",
    reference: "4.2.1"}],
  ["../../../../.esy/source/i/browserify_zlib__0.2.0__4f472b87/",
  {
    name: "browserify-zlib",
    reference: "0.2.0"}],
  ["../../../../.esy/source/i/bs_fetch__0.4.0__f431efa2/",
  {
    name: "bs-fetch",
    reference: "0.4.0"}],
  ["../../../../.esy/source/i/bs_platform__8.2.0__ddbdd6ba/",
  {
    name: "bs-platform",
    reference: "8.2.0"}],
  ["../../../../.esy/source/i/buffer__4.9.2__1089034e/",
  {
    name: "buffer",
    reference: "4.9.2"}],
  ["../../../../.esy/source/i/buffer_from__1.1.2__f23dfc46/",
  {
    name: "buffer-from",
    reference: "1.1.2"}],
  ["../../../../.esy/source/i/buffer_indexof__1.1.1__35a00846/",
  {
    name: "buffer-indexof",
    reference: "1.1.1"}],
  ["../../../../.esy/source/i/buffer_xor__1.0.3__ede1928a/",
  {
    name: "buffer-xor",
    reference: "1.0.3"}],
  ["../../../../.esy/source/i/builtin_status_codes__3.0.0__1c298d47/",
  {
    name: "builtin-status-codes",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/bytes__3.0.0__e858adb1/",
  {
    name: "bytes",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/bytes__3.1.2__a1f54551/",
  {
    name: "bytes",
    reference: "3.1.2"}],
  ["../../../../.esy/source/i/cacache__12.0.4__acd70ea4/",
  {
    name: "cacache",
    reference: "12.0.4"}],
  ["../../../../.esy/source/i/cache_base__1.0.1__ab79e2ff/",
  {
    name: "cache-base",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/call_bind__1.0.2__5b48f9ba/",
  {
    name: "call-bind",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/camel_case__3.0.0__fd201c6c/",
  {
    name: "camel-case",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/camelcase__5.3.1__f083c5b6/",
  {
    name: "camelcase",
    reference: "5.3.1"}],
  ["../../../../.esy/source/i/chalk__2.4.2__cdd4307b/",
  {
    name: "chalk",
    reference: "2.4.2"}],
  ["../../../../.esy/source/i/chokidar__2.1.8__c2e79b59/",
  {
    name: "chokidar",
    reference: "2.1.8"}],
  ["../../../../.esy/source/i/chokidar__3.5.3__b46c11ce/",
  {
    name: "chokidar",
    reference: "3.5.3"}],
  ["../../../../.esy/source/i/chownr__1.1.4__597887ef/",
  {
    name: "chownr",
    reference: "1.1.4"}],
  ["../../../../.esy/source/i/chrome_trace_event__1.0.3__b08140d5/",
  {
    name: "chrome-trace-event",
    reference: "1.0.3"}],
  ["../../../../.esy/source/i/cipher_base__1.0.4__f83cb60b/",
  {
    name: "cipher-base",
    reference: "1.0.4"}],
  ["../../../../.esy/source/i/class_utils__0.3.6__3ab22a3d/",
  {
    name: "class-utils",
    reference: "0.3.6"}],
  ["../../../../.esy/source/i/clean_css__4.2.4__39fff97a/",
  {
    name: "clean-css",
    reference: "4.2.4"}],
  ["../../../../.esy/source/i/cliui__5.0.0__7e015b22/",
  {
    name: "cliui",
    reference: "5.0.0"}],
  ["../../../../.esy/source/i/collection_visit__1.0.0__5ba603a9/",
  {
    name: "collection-visit",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/color_convert__1.9.3__a7e8c654/",
  {
    name: "color-convert",
    reference: "1.9.3"}],
  ["../../../../.esy/source/i/color_name__1.1.3__2497ef27/",
  {
    name: "color-name",
    reference: "1.1.3"}],
  ["../../../../.esy/source/i/commander__2.17.1__50936659/",
  {
    name: "commander",
    reference: "2.17.1"}],
  ["../../../../.esy/source/i/commander__2.19.0__2b08e093/",
  {
    name: "commander",
    reference: "2.19.0"}],
  ["../../../../.esy/source/i/commander__2.20.3__862c0525/",
  {
    name: "commander",
    reference: "2.20.3"}],
  ["../../../../.esy/source/i/commondir__1.0.1__7e150a21/",
  {
    name: "commondir",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/component_emitter__1.3.0__ec2c5ccf/",
  {
    name: "component-emitter",
    reference: "1.3.0"}],
  ["../../../../.esy/source/i/compressible__2.0.18__61dabd69/",
  {
    name: "compressible",
    reference: "2.0.18"}],
  ["../../../../.esy/source/i/compression__1.7.4__c37c0be5/",
  {
    name: "compression",
    reference: "1.7.4"}],
  ["../../../../.esy/source/i/concat_map__0.0.1__c7999216/",
  {
    name: "concat-map",
    reference: "0.0.1"}],
  ["../../../../.esy/source/i/concat_stream__1.6.2__9a7f0902/",
  {
    name: "concat-stream",
    reference: "1.6.2"}],
  ["../../../../.esy/source/i/connect_history_api_fallback__1.6.0__e1684720/",
  {
    name: "connect-history-api-fallback",
    reference: "1.6.0"}],
  ["../../../../.esy/source/i/console_browserify__1.2.0__d6d684b8/",
  {
    name: "console-browserify",
    reference: "1.2.0"}],
  ["../../../../.esy/source/i/constants_browserify__1.0.0__bdaaf074/",
  {
    name: "constants-browserify",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/content_disposition__0.5.4__52d8a27a/",
  {
    name: "content-disposition",
    reference: "0.5.4"}],
  ["../../../../.esy/source/i/content_type__1.0.4__de9fccdf/",
  {
    name: "content-type",
    reference: "1.0.4"}],
  ["../../../../.esy/source/i/cookie__0.5.0__00603c54/",
  {
    name: "cookie",
    reference: "0.5.0"}],
  ["../../../../.esy/source/i/cookie_signature__1.0.6__0a93d3a9/",
  {
    name: "cookie-signature",
    reference: "1.0.6"}],
  ["../../../../.esy/source/i/copy_concurrently__1.0.5__6c5abd00/",
  {
    name: "copy-concurrently",
    reference: "1.0.5"}],
  ["../../../../.esy/source/i/copy_descriptor__0.1.1__b4878afe/",
  {
    name: "copy-descriptor",
    reference: "0.1.1"}],
  ["../../../../.esy/source/i/copy_webpack_plugin__5.1.2__5ba35fb8/",
  {
    name: "copy-webpack-plugin",
    reference: "5.1.2"}],
  ["../../../../.esy/source/i/core_util_is__1.0.3__9b7e4517/",
  {
    name: "core-util-is",
    reference: "1.0.3"}],
  ["../../../../.esy/source/i/create_ecdh__4.0.4__ac243d6f/",
  {
    name: "create-ecdh",
    reference: "4.0.4"}],
  ["../../../../.esy/source/i/create_hash__1.2.0__ed4bf55b/",
  {
    name: "create-hash",
    reference: "1.2.0"}],
  ["../../../../.esy/source/i/create_hmac__1.1.7__6d041196/",
  {
    name: "create-hmac",
    reference: "1.1.7"}],
  ["../../../../.esy/source/i/cross_spawn__6.0.5__396ecb10/",
  {
    name: "cross-spawn",
    reference: "6.0.5"}],
  ["../../../../.esy/source/i/crypto_browserify__3.12.0__245f7640/",
  {
    name: "crypto-browserify",
    reference: "3.12.0"}],
  ["../../../../.esy/source/i/css_select__4.3.0__d7b88c75/",
  {
    name: "css-select",
    reference: "4.3.0"}],
  ["../../../../.esy/source/i/css_what__6.1.0__f5549109/",
  {
    name: "css-what",
    reference: "6.1.0"}],
  ["../../../../.esy/source/i/cyclist__1.0.1__54b8a80f/",
  {
    name: "cyclist",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/debug__2.6.9__8eaf8f1e/",
  {
    name: "debug",
    reference: "2.6.9"}],
  ["../../../../.esy/source/i/debug__3.2.7__0d44723a/",
  {
    name: "debug",
    reference: "3.2.7"}],
  ["../../../../.esy/source/i/debug__4.3.4__84af5971/",
  {
    name: "debug",
    reference: "4.3.4"}],
  ["../../../../.esy/source/i/decamelize__1.2.0__8db54854/",
  {
    name: "decamelize",
    reference: "1.2.0"}],
  ["../../../../.esy/source/i/decode_uri_component__0.2.0__85d618dc/",
  {
    name: "decode-uri-component",
    reference: "0.2.0"}],
  ["../../../../.esy/source/i/deep_equal__1.1.1__a7fd4bc9/",
  {
    name: "deep-equal",
    reference: "1.1.1"}],
  ["../../../../.esy/source/i/default_gateway__4.2.0__bf86f29b/",
  {
    name: "default-gateway",
    reference: "4.2.0"}],
  ["../../../../.esy/source/i/define_properties__1.1.4__750f55d3/",
  {
    name: "define-properties",
    reference: "1.1.4"}],
  ["../../../../.esy/source/i/define_property__0.2.5__35bf1352/",
  {
    name: "define-property",
    reference: "0.2.5"}],
  ["../../../../.esy/source/i/define_property__1.0.0__f7276e5e/",
  {
    name: "define-property",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/define_property__2.0.2__aa71f45e/",
  {
    name: "define-property",
    reference: "2.0.2"}],
  ["../../../../.esy/source/i/del__4.1.1__7efd58ba/",
  {
    name: "del",
    reference: "4.1.1"}],
  ["../../../../.esy/source/i/depd__1.1.2__5a587264/",
  {
    name: "depd",
    reference: "1.1.2"}],
  ["../../../../.esy/source/i/depd__2.0.0__b402d6b8/",
  {
    name: "depd",
    reference: "2.0.0"}],
  ["../../../../.esy/source/i/des.js__1.0.1__dcae382a/",
  {
    name: "des.js",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/destroy__1.2.0__486e1713/",
  {
    name: "destroy",
    reference: "1.2.0"}],
  ["../../../../.esy/source/i/detect_file__1.0.0__055d4bf6/",
  {
    name: "detect-file",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/detect_node__2.1.0__0f4b11f7/",
  {
    name: "detect-node",
    reference: "2.1.0"}],
  ["../../../../.esy/source/i/diffie_hellman__5.0.3__1edebd66/",
  {
    name: "diffie-hellman",
    reference: "5.0.3"}],
  ["../../../../.esy/source/i/dir_glob__2.2.2__1c4c40a7/",
  {
    name: "dir-glob",
    reference: "2.2.2"}],
  ["../../../../.esy/source/i/dns_equal__1.0.0__a90a6625/",
  {
    name: "dns-equal",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/dns_packet__1.3.4__f7041f77/",
  {
    name: "dns-packet",
    reference: "1.3.4"}],
  ["../../../../.esy/source/i/dns_txt__2.0.2__4e21e52c/",
  {
    name: "dns-txt",
    reference: "2.0.2"}],
  ["../../../../.esy/source/i/dom_converter__0.2.0__5f670230/",
  {
    name: "dom-converter",
    reference: "0.2.0"}],
  ["../../../../.esy/source/i/dom_serializer__1.4.1__59281f91/",
  {
    name: "dom-serializer",
    reference: "1.4.1"}],
  ["../../../../.esy/source/i/domain_browser__1.2.0__ec710723/",
  {
    name: "domain-browser",
    reference: "1.2.0"}],
  ["../../../../.esy/source/i/domelementtype__2.3.0__7da79419/",
  {
    name: "domelementtype",
    reference: "2.3.0"}],
  ["../../../../.esy/source/i/domhandler__4.3.1__74473e92/",
  {
    name: "domhandler",
    reference: "4.3.1"}],
  ["../../../../.esy/source/i/domutils__2.8.0__e6970228/",
  {
    name: "domutils",
    reference: "2.8.0"}],
  ["../../../../.esy/source/i/duplexify__3.7.1__a6e2abdc/",
  {
    name: "duplexify",
    reference: "3.7.1"}],
  ["../../../../.esy/source/i/ee_first__1.1.1__ab35044e/",
  {
    name: "ee-first",
    reference: "1.1.1"}],
  ["../../../../.esy/source/i/elliptic__6.5.4__f5e3a40d/",
  {
    name: "elliptic",
    reference: "6.5.4"}],
  ["../../../../.esy/source/i/emoji_regex__7.0.3__d6dfe2a1/",
  {
    name: "emoji-regex",
    reference: "7.0.3"}],
  ["../../../../.esy/source/i/emojis_list__2.1.0__3f5f22d9/",
  {
    name: "emojis-list",
    reference: "2.1.0"}],
  ["../../../../.esy/source/i/emojis_list__3.0.0__564bece5/",
  {
    name: "emojis-list",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/encodeurl__1.0.2__dcc1af85/",
  {
    name: "encodeurl",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/end_of_stream__1.4.4__29536c64/",
  {
    name: "end-of-stream",
    reference: "1.4.4"}],
  ["../../../../.esy/source/i/enhanced_resolve__4.5.0__76217e8c/",
  {
    name: "enhanced-resolve",
    reference: "4.5.0"}],
  ["../../../../.esy/source/i/entities__2.2.0__1315db62/",
  {
    name: "entities",
    reference: "2.2.0"}],
  ["../../../../.esy/source/i/errno__0.1.8__754bc14a/",
  {
    name: "errno",
    reference: "0.1.8"}],
  ["../../../../.esy/source/i/es_abstract__1.20.0__027b0011/",
  {
    name: "es-abstract",
    reference: "1.20.0"}],
  ["../../../../.esy/source/i/es_to_primitive__1.2.1__5bdeba0e/",
  {
    name: "es-to-primitive",
    reference: "1.2.1"}],
  ["../../../../.esy/source/i/escape_html__1.0.3__89c8e646/",
  {
    name: "escape-html",
    reference: "1.0.3"}],
  ["../../../../.esy/source/i/escape_string_regexp__1.0.5__08b8b625/",
  {
    name: "escape-string-regexp",
    reference: "1.0.5"}],
  ["../../../../.esy/source/i/eslint_scope__4.0.3__d18e3b0a/",
  {
    name: "eslint-scope",
    reference: "4.0.3"}],
  ["../../../../.esy/source/i/esrecurse__4.3.0__905a981b/",
  {
    name: "esrecurse",
    reference: "4.3.0"}],
  ["../../../../.esy/source/i/estraverse__4.3.0__539360ea/",
  {
    name: "estraverse",
    reference: "4.3.0"}],
  ["../../../../.esy/source/i/estraverse__5.3.0__f2da041e/",
  {
    name: "estraverse",
    reference: "5.3.0"}],
  ["../../../../.esy/source/i/etag__1.8.1__9339258c/",
  {
    name: "etag",
    reference: "1.8.1"}],
  ["../../../../.esy/source/i/eventemitter3__4.0.7__4d4dc8c3/",
  {
    name: "eventemitter3",
    reference: "4.0.7"}],
  ["../../../../.esy/source/i/events__3.3.0__f337db48/",
  {
    name: "events",
    reference: "3.3.0"}],
  ["../../../../.esy/source/i/eventsource__1.1.1__3f829012/",
  {
    name: "eventsource",
    reference: "1.1.1"}],
  ["../../../../.esy/source/i/evp__bytestokey__1.0.3__c8858746/",
  {
    name: "evp_bytestokey",
    reference: "1.0.3"}],
  ["../../../../.esy/source/i/execa__1.0.0__7c978f7c/",
  {
    name: "execa",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/expand_brackets__2.1.4__15f41e0c/",
  {
    name: "expand-brackets",
    reference: "2.1.4"}],
  ["../../../../.esy/source/i/expand_tilde__2.0.2__5ca545ca/",
  {
    name: "expand-tilde",
    reference: "2.0.2"}],
  ["../../../../.esy/source/i/express__4.18.1__bb465d89/",
  {
    name: "express",
    reference: "4.18.1"}],
  ["../../../../.esy/source/i/extend_shallow__2.0.1__65c3deaf/",
  {
    name: "extend-shallow",
    reference: "2.0.1"}],
  ["../../../../.esy/source/i/extend_shallow__3.0.2__8e38f124/",
  {
    name: "extend-shallow",
    reference: "3.0.2"}],
  ["../../../../.esy/source/i/extglob__2.0.4__ff5831fb/",
  {
    name: "extglob",
    reference: "2.0.4"}],
  ["../../../../.esy/source/i/fast_deep_equal__3.1.3__973bc016/",
  {
    name: "fast-deep-equal",
    reference: "3.1.3"}],
  ["../../../../.esy/source/i/fast_json_stable_stringify__2.1.0__e7b65021/",
  {
    name: "fast-json-stable-stringify",
    reference: "2.1.0"}],
  ["../../../../.esy/source/i/faye_websocket__0.11.4__b5464de2/",
  {
    name: "faye-websocket",
    reference: "0.11.4"}],
  ["../../../../.esy/source/i/figgy_pudding__3.5.2__3cd9c113/",
  {
    name: "figgy-pudding",
    reference: "3.5.2"}],
  ["../../../../.esy/source/i/file_uri_to_path__1.0.0__9a218bbb/",
  {
    name: "file-uri-to-path",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/fill_range__4.0.0__d5dfefd7/",
  {
    name: "fill-range",
    reference: "4.0.0"}],
  ["../../../../.esy/source/i/fill_range__7.0.1__2354263a/",
  {
    name: "fill-range",
    reference: "7.0.1"}],
  ["../../../../.esy/source/i/finalhandler__1.2.0__f579b733/",
  {
    name: "finalhandler",
    reference: "1.2.0"}],
  ["../../../../.esy/source/i/find_cache_dir__2.1.0__e3d97cdf/",
  {
    name: "find-cache-dir",
    reference: "2.1.0"}],
  ["../../../../.esy/source/i/find_up__3.0.0__30e86e01/",
  {
    name: "find-up",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/findup_sync__3.0.0__ce917286/",
  {
    name: "findup-sync",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/flush_write_stream__1.1.1__04d2efbf/",
  {
    name: "flush-write-stream",
    reference: "1.1.1"}],
  ["../../../../.esy/source/i/follow_redirects__1.15.0__386d3e1c/",
  {
    name: "follow-redirects",
    reference: "1.15.0"}],
  ["../../../../.esy/source/i/for_in__1.0.2__8016c44d/",
  {
    name: "for-in",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/forwarded__0.2.0__4a257222/",
  {
    name: "forwarded",
    reference: "0.2.0"}],
  ["../../../../.esy/source/i/fragment_cache__0.2.1__6a18be86/",
  {
    name: "fragment-cache",
    reference: "0.2.1"}],
  ["../../../../.esy/source/i/fresh__0.5.2__c27d9c34/",
  {
    name: "fresh",
    reference: "0.5.2"}],
  ["../../../../.esy/source/i/from2__2.3.0__dbf82e4a/",
  {
    name: "from2",
    reference: "2.3.0"}],
  ["../../../../.esy/source/i/fs.realpath__1.0.0__094c11ca/",
  {
    name: "fs.realpath",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/fs_write_stream_atomic__1.0.10__2e86c5b1/",
  {
    name: "fs-write-stream-atomic",
    reference: "1.0.10"}],
  ["../../../../.esy/source/i/fsevents__1.2.13__abc3ee2e/",
  {
    name: "fsevents",
    reference: "1.2.13"}],
  ["../../../../.esy/source/i/fsevents__2.3.2__d3d926a0/",
  {
    name: "fsevents",
    reference: "2.3.2"}],
  ["../../../../.esy/source/i/function.prototype.name__1.1.5__cd82cf58/",
  {
    name: "function.prototype.name",
    reference: "1.1.5"}],
  ["../../../../.esy/source/i/function_bind__1.1.1__98f8a427/",
  {
    name: "function-bind",
    reference: "1.1.1"}],
  ["../../../../.esy/source/i/functions_have_names__1.2.3__095ffa2c/",
  {
    name: "functions-have-names",
    reference: "1.2.3"}],
  ["../../../../.esy/source/i/get_caller_file__2.0.5__ef007ca2/",
  {
    name: "get-caller-file",
    reference: "2.0.5"}],
  ["../../../../.esy/source/i/get_intrinsic__1.1.1__968d02eb/",
  {
    name: "get-intrinsic",
    reference: "1.1.1"}],
  ["../../../../.esy/source/i/get_stream__4.1.0__c6459916/",
  {
    name: "get-stream",
    reference: "4.1.0"}],
  ["../../../../.esy/source/i/get_symbol_description__1.0.0__062b0644/",
  {
    name: "get-symbol-description",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/get_value__2.0.6__147b5c9f/",
  {
    name: "get-value",
    reference: "2.0.6"}],
  ["../../../../.esy/source/i/glennsl__s__bs_json__5.0.4__eae7c80c/",
  {
    name: "@glennsl/bs-json",
    reference: "5.0.4"}],
  ["../../../../.esy/source/i/glob__7.2.2__dcf5869f/",
  {
    name: "glob",
    reference: "7.2.2"}],
  ["../../../../.esy/source/i/glob_parent__3.1.0__cbff0fa9/",
  {
    name: "glob-parent",
    reference: "3.1.0"}],
  ["../../../../.esy/source/i/glob_parent__5.1.2__4ec35c05/",
  {
    name: "glob-parent",
    reference: "5.1.2"}],
  ["../../../../.esy/source/i/global_modules__1.0.0__a45225d0/",
  {
    name: "global-modules",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/global_modules__2.0.0__621aad0e/",
  {
    name: "global-modules",
    reference: "2.0.0"}],
  ["../../../../.esy/source/i/global_prefix__1.0.2__7ff1d031/",
  {
    name: "global-prefix",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/global_prefix__3.0.0__6989d4d5/",
  {
    name: "global-prefix",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/globby__6.1.0__40b54b4c/",
  {
    name: "globby",
    reference: "6.1.0"}],
  ["../../../../.esy/source/i/globby__7.1.1__23ffa78f/",
  {
    name: "globby",
    reference: "7.1.1"}],
  ["../../../../.esy/source/i/graceful_fs__4.2.10__ecba3630/",
  {
    name: "graceful-fs",
    reference: "4.2.10"}],
  ["../../../../.esy/source/i/handle_thing__2.0.1__d8728e08/",
  {
    name: "handle-thing",
    reference: "2.0.1"}],
  ["../../../../.esy/source/i/has__1.0.3__79b9f05d/",
  {
    name: "has",
    reference: "1.0.3"}],
  ["../../../../.esy/source/i/has_bigints__1.0.2__4d65ab66/",
  {
    name: "has-bigints",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/has_flag__3.0.0__058d2bde/",
  {
    name: "has-flag",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/has_property_descriptors__1.0.0__8426e6cc/",
  {
    name: "has-property-descriptors",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/has_symbols__1.0.3__c534f6bf/",
  {
    name: "has-symbols",
    reference: "1.0.3"}],
  ["../../../../.esy/source/i/has_tostringtag__1.0.0__1509a087/",
  {
    name: "has-tostringtag",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/has_value__0.3.1__802ffa1f/",
  {
    name: "has-value",
    reference: "0.3.1"}],
  ["../../../../.esy/source/i/has_value__1.0.0__6bf1e647/",
  {
    name: "has-value",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/has_values__0.1.4__95f0f007/",
  {
    name: "has-values",
    reference: "0.1.4"}],
  ["../../../../.esy/source/i/has_values__1.0.0__f4b60ee2/",
  {
    name: "has-values",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/hash.js__1.1.7__4dc65e56/",
  {
    name: "hash.js",
    reference: "1.1.7"}],
  ["../../../../.esy/source/i/hash_base__3.1.0__a7885511/",
  {
    name: "hash-base",
    reference: "3.1.0"}],
  ["../../../../.esy/source/i/he__1.2.0__629bc263/",
  {
    name: "he",
    reference: "1.2.0"}],
  ["../../../../.esy/source/i/hmac_drbg__1.0.1__25d0c230/",
  {
    name: "hmac-drbg",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/homedir_polyfill__1.0.3__3506c0cc/",
  {
    name: "homedir-polyfill",
    reference: "1.0.3"}],
  ["../../../../.esy/source/i/hpack.js__2.1.6__67cd288a/",
  {
    name: "hpack.js",
    reference: "2.1.6"}],
  ["../../../../.esy/source/i/html_entities__1.4.0__757dfa28/",
  {
    name: "html-entities",
    reference: "1.4.0"}],
  ["../../../../.esy/source/i/html_minifier__3.5.21__c173b3e9/",
  {
    name: "html-minifier",
    reference: "3.5.21"}],
  ["../../../../.esy/source/i/html_webpack_plugin__3.2.0__ce295689/",
  {
    name: "html-webpack-plugin",
    reference: "3.2.0"}],
  ["../../../../.esy/source/i/htmlparser2__6.1.0__33645102/",
  {
    name: "htmlparser2",
    reference: "6.1.0"}],
  ["../../../../.esy/source/i/http_deceiver__1.2.7__58bdfb4a/",
  {
    name: "http-deceiver",
    reference: "1.2.7"}],
  ["../../../../.esy/source/i/http_errors__1.6.3__90607d9e/",
  {
    name: "http-errors",
    reference: "1.6.3"}],
  ["../../../../.esy/source/i/http_errors__2.0.0__faeeb707/",
  {
    name: "http-errors",
    reference: "2.0.0"}],
  ["../../../../.esy/source/i/http_parser_js__0.5.6__9c18778a/",
  {
    name: "http-parser-js",
    reference: "0.5.6"}],
  ["../../../../.esy/source/i/http_proxy__1.18.1__152ddd50/",
  {
    name: "http-proxy",
    reference: "1.18.1"}],
  ["../../../../.esy/source/i/http_proxy_middleware__0.19.1__90845fb7/",
  {
    name: "http-proxy-middleware",
    reference: "0.19.1"}],
  ["../../../../.esy/source/i/https_browserify__1.0.0__e1586026/",
  {
    name: "https-browserify",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/iconv_lite__0.4.24__0f6d0a3e/",
  {
    name: "iconv-lite",
    reference: "0.4.24"}],
  ["../../../../.esy/source/i/ieee754__1.2.1__9af8fceb/",
  {
    name: "ieee754",
    reference: "1.2.1"}],
  ["../../../../.esy/source/i/iferr__0.1.5__29cfe6e7/",
  {
    name: "iferr",
    reference: "0.1.5"}],
  ["../../../../.esy/source/i/ignore__3.3.10__67a5951d/",
  {
    name: "ignore",
    reference: "3.3.10"}],
  ["../../../../.esy/source/i/import_local__2.0.0__3ccd2e5a/",
  {
    name: "import-local",
    reference: "2.0.0"}],
  ["../../../../.esy/source/i/imurmurhash__0.1.4__1fc42006/",
  {
    name: "imurmurhash",
    reference: "0.1.4"}],
  ["../../../../.esy/source/i/infer_owner__1.0.4__b668b087/",
  {
    name: "infer-owner",
    reference: "1.0.4"}],
  ["../../../../.esy/source/i/inflight__1.0.6__5ef09bf2/",
  {
    name: "inflight",
    reference: "1.0.6"}],
  ["../../../../.esy/source/i/inherits__2.0.1__5e13f6eb/",
  {
    name: "inherits",
    reference: "2.0.1"}],
  ["../../../../.esy/source/i/inherits__2.0.3__e91f0785/",
  {
    name: "inherits",
    reference: "2.0.3"}],
  ["../../../../.esy/source/i/inherits__2.0.4__5ce658b5/",
  {
    name: "inherits",
    reference: "2.0.4"}],
  ["../../../../.esy/source/i/ini__1.3.8__340372ca/",
  {
    name: "ini",
    reference: "1.3.8"}],
  ["../../../../.esy/source/i/internal_ip__4.3.0__33fb4e47/",
  {
    name: "internal-ip",
    reference: "4.3.0"}],
  ["../../../../.esy/source/i/internal_slot__1.0.3__d29b7c8d/",
  {
    name: "internal-slot",
    reference: "1.0.3"}],
  ["../../../../.esy/source/i/interpret__1.4.0__096e01d6/",
  {
    name: "interpret",
    reference: "1.4.0"}],
  ["../../../../.esy/source/i/ip__1.1.8__71f1d814/",
  {
    name: "ip",
    reference: "1.1.8"}],
  ["../../../../.esy/source/i/ip_regex__2.1.0__5e630305/",
  {
    name: "ip-regex",
    reference: "2.1.0"}],
  ["../../../../.esy/source/i/ipaddr.js__1.9.1__32a5fafd/",
  {
    name: "ipaddr.js",
    reference: "1.9.1"}],
  ["../../../../.esy/source/i/is_absolute_url__3.0.3__51d7c368/",
  {
    name: "is-absolute-url",
    reference: "3.0.3"}],
  ["../../../../.esy/source/i/is_accessor_descriptor__0.1.6__892d8573/",
  {
    name: "is-accessor-descriptor",
    reference: "0.1.6"}],
  ["../../../../.esy/source/i/is_accessor_descriptor__1.0.0__108888c1/",
  {
    name: "is-accessor-descriptor",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/is_arguments__1.1.1__224bd1dd/",
  {
    name: "is-arguments",
    reference: "1.1.1"}],
  ["../../../../.esy/source/i/is_bigint__1.0.4__dfe9f921/",
  {
    name: "is-bigint",
    reference: "1.0.4"}],
  ["../../../../.esy/source/i/is_binary_path__1.0.1__569b061f/",
  {
    name: "is-binary-path",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/is_binary_path__2.1.0__15ac85d3/",
  {
    name: "is-binary-path",
    reference: "2.1.0"}],
  ["../../../../.esy/source/i/is_boolean_object__1.1.2__e596cd56/",
  {
    name: "is-boolean-object",
    reference: "1.1.2"}],
  ["../../../../.esy/source/i/is_buffer__1.1.6__f9508fd1/",
  {
    name: "is-buffer",
    reference: "1.1.6"}],
  ["../../../../.esy/source/i/is_callable__1.2.4__8b9db246/",
  {
    name: "is-callable",
    reference: "1.2.4"}],
  ["../../../../.esy/source/i/is_data_descriptor__0.1.4__79d141c0/",
  {
    name: "is-data-descriptor",
    reference: "0.1.4"}],
  ["../../../../.esy/source/i/is_data_descriptor__1.0.0__45e804c7/",
  {
    name: "is-data-descriptor",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/is_date_object__1.0.5__5dc73cf7/",
  {
    name: "is-date-object",
    reference: "1.0.5"}],
  ["../../../../.esy/source/i/is_descriptor__0.1.6__e33f1b8b/",
  {
    name: "is-descriptor",
    reference: "0.1.6"}],
  ["../../../../.esy/source/i/is_descriptor__1.0.2__9886fab7/",
  {
    name: "is-descriptor",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/is_extendable__0.1.1__660e53d4/",
  {
    name: "is-extendable",
    reference: "0.1.1"}],
  ["../../../../.esy/source/i/is_extendable__1.0.1__42926f00/",
  {
    name: "is-extendable",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/is_extglob__2.1.1__8fa4f21a/",
  {
    name: "is-extglob",
    reference: "2.1.1"}],
  ["../../../../.esy/source/i/is_fullwidth_code_point__2.0.0__3d7ff1c2/",
  {
    name: "is-fullwidth-code-point",
    reference: "2.0.0"}],
  ["../../../../.esy/source/i/is_glob__3.1.0__8ead7f75/",
  {
    name: "is-glob",
    reference: "3.1.0"}],
  ["../../../../.esy/source/i/is_glob__4.0.3__76072e4e/",
  {
    name: "is-glob",
    reference: "4.0.3"}],
  ["../../../../.esy/source/i/is_negative_zero__2.0.2__db4fde0d/",
  {
    name: "is-negative-zero",
    reference: "2.0.2"}],
  ["../../../../.esy/source/i/is_number__3.0.0__46772964/",
  {
    name: "is-number",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/is_number__7.0.0__e3bfa7e2/",
  {
    name: "is-number",
    reference: "7.0.0"}],
  ["../../../../.esy/source/i/is_number_object__1.0.7__6c51eba3/",
  {
    name: "is-number-object",
    reference: "1.0.7"}],
  ["../../../../.esy/source/i/is_path_cwd__2.2.0__c94f01a7/",
  {
    name: "is-path-cwd",
    reference: "2.2.0"}],
  ["../../../../.esy/source/i/is_path_in_cwd__2.1.0__5853d7b6/",
  {
    name: "is-path-in-cwd",
    reference: "2.1.0"}],
  ["../../../../.esy/source/i/is_path_inside__2.1.0__b2679405/",
  {
    name: "is-path-inside",
    reference: "2.1.0"}],
  ["../../../../.esy/source/i/is_plain_object__2.0.4__50413263/",
  {
    name: "is-plain-object",
    reference: "2.0.4"}],
  ["../../../../.esy/source/i/is_regex__1.1.4__9d8b5c4d/",
  {
    name: "is-regex",
    reference: "1.1.4"}],
  ["../../../../.esy/source/i/is_shared_array_buffer__1.0.2__6df40dee/",
  {
    name: "is-shared-array-buffer",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/is_stream__1.1.0__808b4cab/",
  {
    name: "is-stream",
    reference: "1.1.0"}],
  ["../../../../.esy/source/i/is_string__1.0.7__2aad9466/",
  {
    name: "is-string",
    reference: "1.0.7"}],
  ["../../../../.esy/source/i/is_symbol__1.0.4__11fb5c86/",
  {
    name: "is-symbol",
    reference: "1.0.4"}],
  ["../../../../.esy/source/i/is_weakref__1.0.2__43ec266e/",
  {
    name: "is-weakref",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/is_windows__1.0.2__e09f5a28/",
  {
    name: "is-windows",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/is_wsl__1.1.0__50f4ef2c/",
  {
    name: "is-wsl",
    reference: "1.1.0"}],
  ["../../../../.esy/source/i/isarray__1.0.0__6cecb641/",
  {
    name: "isarray",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/isexe__2.0.0__01c1de49/",
  {
    name: "isexe",
    reference: "2.0.0"}],
  ["../../../../.esy/source/i/isobject__2.1.0__b1b028ee/",
  {
    name: "isobject",
    reference: "2.1.0"}],
  ["../../../../.esy/source/i/isobject__3.0.1__892637c7/",
  {
    name: "isobject",
    reference: "3.0.1"}],
  ["../../../../.esy/source/i/js_tokens__4.0.0__13c348c2/",
  {
    name: "js-tokens",
    reference: "4.0.0"}],
  ["../../../../.esy/source/i/json5__0.5.1__441adc8d/",
  {
    name: "json5",
    reference: "0.5.1"}],
  ["../../../../.esy/source/i/json5__1.0.1__d92fd0aa/",
  {
    name: "json5",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/json_parse_better_errors__1.0.2__c798f0f1/",
  {
    name: "json-parse-better-errors",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/json_schema_traverse__0.4.1__43d23351/",
  {
    name: "json-schema-traverse",
    reference: "0.4.1"}],
  ["../../../../.esy/source/i/killable__1.0.1__51e89aa5/",
  {
    name: "killable",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/kind_of__3.2.2__d01f6796/",
  {
    name: "kind-of",
    reference: "3.2.2"}],
  ["../../../../.esy/source/i/kind_of__4.0.0__db2bf5e3/",
  {
    name: "kind-of",
    reference: "4.0.0"}],
  ["../../../../.esy/source/i/kind_of__5.1.0__d39d9bfc/",
  {
    name: "kind-of",
    reference: "5.1.0"}],
  ["../../../../.esy/source/i/kind_of__6.0.3__5e3ab80e/",
  {
    name: "kind-of",
    reference: "6.0.3"}],
  ["../../../../.esy/source/i/loader_runner__2.4.0__575b6473/",
  {
    name: "loader-runner",
    reference: "2.4.0"}],
  ["../../../../.esy/source/i/loader_utils__0.2.17__2b09d9dc/",
  {
    name: "loader-utils",
    reference: "0.2.17"}],
  ["../../../../.esy/source/i/loader_utils__1.4.0__9a8c1a30/",
  {
    name: "loader-utils",
    reference: "1.4.0"}],
  ["../../../../.esy/source/i/locate_path__3.0.0__c82eae75/",
  {
    name: "locate-path",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/lodash__4.17.21__82c45c9d/",
  {
    name: "lodash",
    reference: "4.17.21"}],
  ["../../../../.esy/source/i/loglevel__1.8.0__b43cdb18/",
  {
    name: "loglevel",
    reference: "1.8.0"}],
  ["../../../../.esy/source/i/loose_envify__1.4.0__f4d87f47/",
  {
    name: "loose-envify",
    reference: "1.4.0"}],
  ["../../../../.esy/source/i/lower_case__1.1.4__cb495517/",
  {
    name: "lower-case",
    reference: "1.1.4"}],
  ["../../../../.esy/source/i/lru_cache__5.1.1__ee5ec39d/",
  {
    name: "lru-cache",
    reference: "5.1.1"}],
  ["../../../../.esy/source/i/make_dir__2.1.0__37198ffc/",
  {
    name: "make-dir",
    reference: "2.1.0"}],
  ["../../../../.esy/source/i/map_cache__0.2.2__ae144545/",
  {
    name: "map-cache",
    reference: "0.2.2"}],
  ["../../../../.esy/source/i/map_visit__1.0.0__b55d6613/",
  {
    name: "map-visit",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/md5.js__1.3.5__b94d1b25/",
  {
    name: "md5.js",
    reference: "1.3.5"}],
  ["../../../../.esy/source/i/media_typer__0.3.0__75b8861a/",
  {
    name: "media-typer",
    reference: "0.3.0"}],
  ["../../../../.esy/source/i/memory_fs__0.4.1__14f0fac8/",
  {
    name: "memory-fs",
    reference: "0.4.1"}],
  ["../../../../.esy/source/i/memory_fs__0.5.0__2811f54b/",
  {
    name: "memory-fs",
    reference: "0.5.0"}],
  ["../../../../.esy/source/i/merge_descriptors__1.0.1__abd45ddb/",
  {
    name: "merge-descriptors",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/methods__1.1.2__77ef1275/",
  {
    name: "methods",
    reference: "1.1.2"}],
  ["../../../../.esy/source/i/micromatch__3.1.10__4fdec659/",
  {
    name: "micromatch",
    reference: "3.1.10"}],
  ["../../../../.esy/source/i/miller_rabin__4.0.1__93ba3590/",
  {
    name: "miller-rabin",
    reference: "4.0.1"}],
  ["../../../../.esy/source/i/mime__1.6.0__34cfdcf1/",
  {
    name: "mime",
    reference: "1.6.0"}],
  ["../../../../.esy/source/i/mime__2.6.0__332f196b/",
  {
    name: "mime",
    reference: "2.6.0"}],
  ["../../../../.esy/source/i/mime_db__1.52.0__95b55558/",
  {
    name: "mime-db",
    reference: "1.52.0"}],
  ["../../../../.esy/source/i/mime_types__2.1.35__ba4679a9/",
  {
    name: "mime-types",
    reference: "2.1.35"}],
  ["../../../../.esy/source/i/minimalistic_assert__1.0.1__2c7fc03f/",
  {
    name: "minimalistic-assert",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/minimalistic_crypto_utils__1.0.1__bb94be3f/",
  {
    name: "minimalistic-crypto-utils",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/minimatch__3.1.2__4b853d7d/",
  {
    name: "minimatch",
    reference: "3.1.2"}],
  ["../../../../.esy/source/i/minimist__1.2.6__0c34a6c6/",
  {
    name: "minimist",
    reference: "1.2.6"}],
  ["../../../../.esy/source/i/mississippi__3.0.0__6f1efb4f/",
  {
    name: "mississippi",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/mixin_deep__1.3.2__57627b76/",
  {
    name: "mixin-deep",
    reference: "1.3.2"}],
  ["../../../../.esy/source/i/mkdirp__0.5.6__8ae93b8b/",
  {
    name: "mkdirp",
    reference: "0.5.6"}],
  ["../../../../.esy/source/i/move_concurrently__1.0.1__1e184273/",
  {
    name: "move-concurrently",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/ms__2.0.0__d842b4cd/",
  {
    name: "ms",
    reference: "2.0.0"}],
  ["../../../../.esy/source/i/ms__2.1.2__44bf868b/",
  {
    name: "ms",
    reference: "2.1.2"}],
  ["../../../../.esy/source/i/ms__2.1.3__e0e23969/",
  {
    name: "ms",
    reference: "2.1.3"}],
  ["../../../../.esy/source/i/multicast_dns__6.2.3__46468492/",
  {
    name: "multicast-dns",
    reference: "6.2.3"}],
  ["../../../../.esy/source/i/multicast_dns_service_types__1.1.0__2b89e1c8/",
  {
    name: "multicast-dns-service-types",
    reference: "1.1.0"}],
  ["../../../../.esy/source/i/nan__2.15.0__00a89088/",
  {
    name: "nan",
    reference: "2.15.0"}],
  ["../../../../.esy/source/i/nanomatch__1.2.13__2a566370/",
  {
    name: "nanomatch",
    reference: "1.2.13"}],
  ["../../../../.esy/source/i/negotiator__0.6.3__8ce50151/",
  {
    name: "negotiator",
    reference: "0.6.3"}],
  ["../../../../.esy/source/i/neo_async__2.6.2__0b3d63e9/",
  {
    name: "neo-async",
    reference: "2.6.2"}],
  ["../../../../.esy/source/i/nice_try__1.0.5__f4f1d459/",
  {
    name: "nice-try",
    reference: "1.0.5"}],
  ["../../../../.esy/source/i/no_case__2.3.2__9b45b5cb/",
  {
    name: "no-case",
    reference: "2.3.2"}],
  ["../../../../.esy/source/i/node_forge__0.10.0__ad5d33b4/",
  {
    name: "node-forge",
    reference: "0.10.0"}],
  ["../../../../.esy/source/i/node_libs_browser__2.2.1__3ce66953/",
  {
    name: "node-libs-browser",
    reference: "2.2.1"}],
  ["../../../../.esy/source/i/normalize_path__2.1.1__baf85fb0/",
  {
    name: "normalize-path",
    reference: "2.1.1"}],
  ["../../../../.esy/source/i/normalize_path__3.0.0__91fa1ad9/",
  {
    name: "normalize-path",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/npm_run_path__2.0.2__12ea0e5b/",
  {
    name: "npm-run-path",
    reference: "2.0.2"}],
  ["../../../../.esy/source/i/nth_check__2.0.1__1a7390b1/",
  {
    name: "nth-check",
    reference: "2.0.1"}],
  ["../../../../.esy/source/i/object.assign__4.1.2__9a6eb629/",
  {
    name: "object.assign",
    reference: "4.1.2"}],
  ["../../../../.esy/source/i/object.getownpropertydescriptors__2.1.3__c230e13a/",
  {
    name: "object.getownpropertydescriptors",
    reference: "2.1.3"}],
  ["../../../../.esy/source/i/object.pick__1.3.0__723792f2/",
  {
    name: "object.pick",
    reference: "1.3.0"}],
  ["../../../../.esy/source/i/object_assign__4.1.1__c3b8f00e/",
  {
    name: "object-assign",
    reference: "4.1.1"}],
  ["../../../../.esy/source/i/object_copy__0.1.0__b1fa7896/",
  {
    name: "object-copy",
    reference: "0.1.0"}],
  ["../../../../.esy/source/i/object_inspect__1.12.0__de610b4e/",
  {
    name: "object-inspect",
    reference: "1.12.0"}],
  ["../../../../.esy/source/i/object_is__1.1.5__38e88932/",
  {
    name: "object-is",
    reference: "1.1.5"}],
  ["../../../../.esy/source/i/object_keys__1.1.1__f0b86008/",
  {
    name: "object-keys",
    reference: "1.1.1"}],
  ["../../../../.esy/source/i/object_visit__1.0.1__c60c875c/",
  {
    name: "object-visit",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/obuf__1.1.2__18753518/",
  {
    name: "obuf",
    reference: "1.1.2"}],
  ["../../../../.esy/source/i/on_finished__2.4.1__b6dfaa81/",
  {
    name: "on-finished",
    reference: "2.4.1"}],
  ["../../../../.esy/source/i/on_headers__1.0.2__9f8e2b09/",
  {
    name: "on-headers",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/once__1.4.0__8285ddde/",
  {
    name: "once",
    reference: "1.4.0"}],
  ["../../../../.esy/source/i/opn__5.5.0__b6db4769/",
  {
    name: "opn",
    reference: "5.5.0"}],
  ["../../../../.esy/source/i/original__1.0.2__37580bec/",
  {
    name: "original",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/os_browserify__0.3.0__bc69e2ab/",
  {
    name: "os-browserify",
    reference: "0.3.0"}],
  ["../../../../.esy/source/i/p_finally__1.0.0__90840028/",
  {
    name: "p-finally",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/p_limit__2.3.0__cfa3bb23/",
  {
    name: "p-limit",
    reference: "2.3.0"}],
  ["../../../../.esy/source/i/p_locate__3.0.0__af40b806/",
  {
    name: "p-locate",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/p_map__2.1.0__58743574/",
  {
    name: "p-map",
    reference: "2.1.0"}],
  ["../../../../.esy/source/i/p_retry__3.0.1__f0fab947/",
  {
    name: "p-retry",
    reference: "3.0.1"}],
  ["../../../../.esy/source/i/p_try__2.2.0__7ec98f05/",
  {
    name: "p-try",
    reference: "2.2.0"}],
  ["../../../../.esy/source/i/pako__1.0.11__b0db269f/",
  {
    name: "pako",
    reference: "1.0.11"}],
  ["../../../../.esy/source/i/parallel_transform__1.2.0__19ce6b17/",
  {
    name: "parallel-transform",
    reference: "1.2.0"}],
  ["../../../../.esy/source/i/param_case__2.1.1__6a899fd8/",
  {
    name: "param-case",
    reference: "2.1.1"}],
  ["../../../../.esy/source/i/parse_asn1__5.1.6__8c27fee2/",
  {
    name: "parse-asn1",
    reference: "5.1.6"}],
  ["../../../../.esy/source/i/parse_passwd__1.0.0__d45a497e/",
  {
    name: "parse-passwd",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/parseurl__1.3.3__256f617c/",
  {
    name: "parseurl",
    reference: "1.3.3"}],
  ["../../../../.esy/source/i/pascalcase__0.1.1__dbba0370/",
  {
    name: "pascalcase",
    reference: "0.1.1"}],
  ["../../../../.esy/source/i/path_browserify__0.0.1__cd5acb46/",
  {
    name: "path-browserify",
    reference: "0.0.1"}],
  ["../../../../.esy/source/i/path_dirname__1.0.2__a788cae1/",
  {
    name: "path-dirname",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/path_exists__3.0.0__bfccc3ac/",
  {
    name: "path-exists",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/path_is_absolute__1.0.1__b16551ae/",
  {
    name: "path-is-absolute",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/path_is_inside__1.0.2__4ae12a5f/",
  {
    name: "path-is-inside",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/path_key__2.0.1__b1422758/",
  {
    name: "path-key",
    reference: "2.0.1"}],
  ["../../../../.esy/source/i/path_to_regexp__0.1.7__3fc67f9b/",
  {
    name: "path-to-regexp",
    reference: "0.1.7"}],
  ["../../../../.esy/source/i/path_type__3.0.0__8834cba1/",
  {
    name: "path-type",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/pbkdf2__3.1.2__96fb3fc1/",
  {
    name: "pbkdf2",
    reference: "3.1.2"}],
  ["../../../../.esy/source/i/picomatch__2.3.1__4699f5fc/",
  {
    name: "picomatch",
    reference: "2.3.1"}],
  ["../../../../.esy/source/i/pify__2.3.0__06d913b2/",
  {
    name: "pify",
    reference: "2.3.0"}],
  ["../../../../.esy/source/i/pify__3.0.0__84d68ebe/",
  {
    name: "pify",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/pify__4.0.1__8980fe74/",
  {
    name: "pify",
    reference: "4.0.1"}],
  ["../../../../.esy/source/i/pinkie__2.0.4__951bb610/",
  {
    name: "pinkie",
    reference: "2.0.4"}],
  ["../../../../.esy/source/i/pinkie_promise__2.0.1__45e23aff/",
  {
    name: "pinkie-promise",
    reference: "2.0.1"}],
  ["../../../../.esy/source/i/pkg_dir__3.0.0__8332d1f5/",
  {
    name: "pkg-dir",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/portfinder__1.0.28__0c222b95/",
  {
    name: "portfinder",
    reference: "1.0.28"}],
  ["../../../../.esy/source/i/posix_character_classes__0.1.1__c9261503/",
  {
    name: "posix-character-classes",
    reference: "0.1.1"}],
  ["../../../../.esy/source/i/pretty_error__2.1.2__b6faf5d3/",
  {
    name: "pretty-error",
    reference: "2.1.2"}],
  ["../../../../.esy/source/i/process__0.11.10__8dc68528/",
  {
    name: "process",
    reference: "0.11.10"}],
  ["../../../../.esy/source/i/process_nextick_args__2.0.1__f8d0a41d/",
  {
    name: "process-nextick-args",
    reference: "2.0.1"}],
  ["../../../../.esy/source/i/promise_inflight__1.0.1__ea14d504/",
  {
    name: "promise-inflight",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/prop_types__15.8.1__fddb6b9e/",
  {
    name: "prop-types",
    reference: "15.8.1"}],
  ["../../../../.esy/source/i/proxy_addr__2.0.7__66a754ca/",
  {
    name: "proxy-addr",
    reference: "2.0.7"}],
  ["../../../../.esy/source/i/prr__1.0.1__b9a75d0f/",
  {
    name: "prr",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/public_encrypt__4.0.3__f123f55f/",
  {
    name: "public-encrypt",
    reference: "4.0.3"}],
  ["../../../../.esy/source/i/pump__2.0.1__6ac1ae9f/",
  {
    name: "pump",
    reference: "2.0.1"}],
  ["../../../../.esy/source/i/pump__3.0.0__650a87ec/",
  {
    name: "pump",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/pumpify__1.5.1__b8cd67d5/",
  {
    name: "pumpify",
    reference: "1.5.1"}],
  ["../../../../.esy/source/i/punycode__1.3.2__ac5b0bb8/",
  {
    name: "punycode",
    reference: "1.3.2"}],
  ["../../../../.esy/source/i/punycode__1.4.1__fa9c3784/",
  {
    name: "punycode",
    reference: "1.4.1"}],
  ["../../../../.esy/source/i/punycode__2.1.1__9d5f3bb8/",
  {
    name: "punycode",
    reference: "2.1.1"}],
  ["../../../../.esy/source/i/qs__6.10.3__33420d87/",
  {
    name: "qs",
    reference: "6.10.3"}],
  ["../../../../.esy/source/i/querystring__0.2.0__9ea05f59/",
  {
    name: "querystring",
    reference: "0.2.0"}],
  ["../../../../.esy/source/i/querystring_es3__0.2.1__d5a8c196/",
  {
    name: "querystring-es3",
    reference: "0.2.1"}],
  ["../../../../.esy/source/i/querystringify__2.2.0__9b263494/",
  {
    name: "querystringify",
    reference: "2.2.0"}],
  ["../../../../.esy/source/i/randombytes__2.1.0__4558ce74/",
  {
    name: "randombytes",
    reference: "2.1.0"}],
  ["../../../../.esy/source/i/randomfill__1.0.4__9ca5fe09/",
  {
    name: "randomfill",
    reference: "1.0.4"}],
  ["../../../../.esy/source/i/range_parser__1.2.1__bbb82e6e/",
  {
    name: "range-parser",
    reference: "1.2.1"}],
  ["../../../../.esy/source/i/raw_body__2.5.1__a8ba5c24/",
  {
    name: "raw-body",
    reference: "2.5.1"}],
  ["../../../../.esy/source/i/rawbones__0.3.5__23b1331b/",
  {
    name: "rawbones",
    reference: "0.3.5"}],
  ["../../../../.esy/source/i/react__16.14.0__ccc04f20/",
  {
    name: "react",
    reference: "16.14.0"}],
  ["../../../../.esy/source/i/react_dom__16.14.0__27c5fac7/",
  {
    name: "react-dom",
    reference: "16.14.0"}],
  ["../../../../.esy/source/i/react_is__16.13.1__8a41bdd9/",
  {
    name: "react-is",
    reference: "16.13.1"}],
  ["../../../../.esy/source/i/readable_stream__2.3.7__2e4a050e/",
  {
    name: "readable-stream",
    reference: "2.3.7"}],
  ["../../../../.esy/source/i/readable_stream__3.6.0__2016d93c/",
  {
    name: "readable-stream",
    reference: "3.6.0"}],
  ["../../../../.esy/source/i/readdirp__2.2.1__89790727/",
  {
    name: "readdirp",
    reference: "2.2.1"}],
  ["../../../../.esy/source/i/readdirp__3.6.0__254ac303/",
  {
    name: "readdirp",
    reference: "3.6.0"}],
  ["../../../../.esy/source/i/reason_react__0.9.1__d0ebedb2/",
  {
    name: "reason-react",
    reference: "0.9.1"}],
  ["../../../../.esy/source/i/regex_not__1.0.2__9a76c75b/",
  {
    name: "regex-not",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/regexp.prototype.flags__1.4.3__8d1910e2/",
  {
    name: "regexp.prototype.flags",
    reference: "1.4.3"}],
  ["../../../../.esy/source/i/relateurl__0.2.7__44e61415/",
  {
    name: "relateurl",
    reference: "0.2.7"}],
  ["../../../../.esy/source/i/remove_trailing_separator__1.1.0__5afd3399/",
  {
    name: "remove-trailing-separator",
    reference: "1.1.0"}],
  ["../../../../.esy/source/i/renderkid__2.0.7__371a205f/",
  {
    name: "renderkid",
    reference: "2.0.7"}],
  ["../../../../.esy/source/i/repeat_element__1.1.4__cce94694/",
  {
    name: "repeat-element",
    reference: "1.1.4"}],
  ["../../../../.esy/source/i/repeat_string__1.6.1__f30c8ba7/",
  {
    name: "repeat-string",
    reference: "1.6.1"}],
  ["../../../../.esy/source/i/require_directory__2.1.1__263c7201/",
  {
    name: "require-directory",
    reference: "2.1.1"}],
  ["../../../../.esy/source/i/require_main_filename__2.0.0__86f489be/",
  {
    name: "require-main-filename",
    reference: "2.0.0"}],
  ["../../../../.esy/source/i/requires_port__1.0.0__3ad550f6/",
  {
    name: "requires-port",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/resolve_cwd__2.0.0__55a80a72/",
  {
    name: "resolve-cwd",
    reference: "2.0.0"}],
  ["../../../../.esy/source/i/resolve_dir__1.0.1__c0d22834/",
  {
    name: "resolve-dir",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/resolve_from__3.0.0__c1a314d9/",
  {
    name: "resolve-from",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/resolve_url__0.2.1__a6983901/",
  {
    name: "resolve-url",
    reference: "0.2.1"}],
  ["../../../../.esy/source/i/ret__0.1.15__017183c7/",
  {
    name: "ret",
    reference: "0.1.15"}],
  ["../../../../.esy/source/i/retry__0.12.0__1b311d7f/",
  {
    name: "retry",
    reference: "0.12.0"}],
  ["../../../../.esy/source/i/rimraf__2.7.1__e0994486/",
  {
    name: "rimraf",
    reference: "2.7.1"}],
  ["../../../../.esy/source/i/ripemd160__2.0.2__d2570416/",
  {
    name: "ripemd160",
    reference: "2.0.2"}],
  ["../../../../.esy/source/i/run_queue__1.0.3__4810c051/",
  {
    name: "run-queue",
    reference: "1.0.3"}],
  ["../../../../.esy/source/i/safe_buffer__5.1.2__e975ebd3/",
  {
    name: "safe-buffer",
    reference: "5.1.2"}],
  ["../../../../.esy/source/i/safe_buffer__5.2.1__4598fe14/",
  {
    name: "safe-buffer",
    reference: "5.2.1"}],
  ["../../../../.esy/source/i/safe_regex__1.1.0__ffc1efdf/",
  {
    name: "safe-regex",
    reference: "1.1.0"}],
  ["../../../../.esy/source/i/safer_buffer__2.1.2__204e3826/",
  {
    name: "safer-buffer",
    reference: "2.1.2"}],
  ["../../../../.esy/source/i/scheduler__0.19.1__f23c7769/",
  {
    name: "scheduler",
    reference: "0.19.1"}],
  ["../../../../.esy/source/i/schema_utils__1.0.0__141ba8e4/",
  {
    name: "schema-utils",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/select_hose__2.0.0__f7d5440a/",
  {
    name: "select-hose",
    reference: "2.0.0"}],
  ["../../../../.esy/source/i/selfsigned__1.10.14__56fc38d6/",
  {
    name: "selfsigned",
    reference: "1.10.14"}],
  ["../../../../.esy/source/i/semver__5.7.1__e3fff838/",
  {
    name: "semver",
    reference: "5.7.1"}],
  ["../../../../.esy/source/i/semver__6.3.0__fb45cafd/",
  {
    name: "semver",
    reference: "6.3.0"}],
  ["../../../../.esy/source/i/send__0.18.0__68382a79/",
  {
    name: "send",
    reference: "0.18.0"}],
  ["../../../../.esy/source/i/serialize_javascript__4.0.0__12aeabb6/",
  {
    name: "serialize-javascript",
    reference: "4.0.0"}],
  ["../../../../.esy/source/i/serve_index__1.9.1__897d748e/",
  {
    name: "serve-index",
    reference: "1.9.1"}],
  ["../../../../.esy/source/i/serve_static__1.15.0__3c8e8c91/",
  {
    name: "serve-static",
    reference: "1.15.0"}],
  ["../../../../.esy/source/i/set_blocking__2.0.0__5d79dd8a/",
  {
    name: "set-blocking",
    reference: "2.0.0"}],
  ["../../../../.esy/source/i/set_value__2.0.1__a2adfdf9/",
  {
    name: "set-value",
    reference: "2.0.1"}],
  ["../../../../.esy/source/i/setimmediate__1.0.5__b0f653d9/",
  {
    name: "setimmediate",
    reference: "1.0.5"}],
  ["../../../../.esy/source/i/setprototypeof__1.1.0__f1f537fb/",
  {
    name: "setprototypeof",
    reference: "1.1.0"}],
  ["../../../../.esy/source/i/setprototypeof__1.2.0__abc59022/",
  {
    name: "setprototypeof",
    reference: "1.2.0"}],
  ["../../../../.esy/source/i/sha.js__2.4.11__4a7b275a/",
  {
    name: "sha.js",
    reference: "2.4.11"}],
  ["../../../../.esy/source/i/shebang_command__1.2.0__d7a62977/",
  {
    name: "shebang-command",
    reference: "1.2.0"}],
  ["../../../../.esy/source/i/shebang_regex__1.0.0__61c22a6d/",
  {
    name: "shebang-regex",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/side_channel__1.0.4__2cc1fc61/",
  {
    name: "side-channel",
    reference: "1.0.4"}],
  ["../../../../.esy/source/i/signal_exit__3.0.7__2427f0d9/",
  {
    name: "signal-exit",
    reference: "3.0.7"}],
  ["../../../../.esy/source/i/slash__1.0.0__360ced2a/",
  {
    name: "slash",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/snapdragon__0.8.2__3333ae58/",
  {
    name: "snapdragon",
    reference: "0.8.2"}],
  ["../../../../.esy/source/i/snapdragon_node__2.1.1__389d2cbf/",
  {
    name: "snapdragon-node",
    reference: "2.1.1"}],
  ["../../../../.esy/source/i/snapdragon_util__3.0.1__09e35752/",
  {
    name: "snapdragon-util",
    reference: "3.0.1"}],
  ["../../../../.esy/source/i/sockjs__0.3.24__71cd2320/",
  {
    name: "sockjs",
    reference: "0.3.24"}],
  ["../../../../.esy/source/i/sockjs_client__1.6.0__ec23204e/",
  {
    name: "sockjs-client",
    reference: "1.6.0"}],
  ["../../../../.esy/source/i/source_list_map__2.0.1__d5e784c2/",
  {
    name: "source-list-map",
    reference: "2.0.1"}],
  ["../../../../.esy/source/i/source_map__0.5.7__f39e7237/",
  {
    name: "source-map",
    reference: "0.5.7"}],
  ["../../../../.esy/source/i/source_map__0.6.1__20131c2b/",
  {
    name: "source-map",
    reference: "0.6.1"}],
  ["../../../../.esy/source/i/source_map_resolve__0.5.3__8aba3b88/",
  {
    name: "source-map-resolve",
    reference: "0.5.3"}],
  ["../../../../.esy/source/i/source_map_support__0.5.21__c4490966/",
  {
    name: "source-map-support",
    reference: "0.5.21"}],
  ["../../../../.esy/source/i/source_map_url__0.4.1__b3241d85/",
  {
    name: "source-map-url",
    reference: "0.4.1"}],
  ["../../../../.esy/source/i/spdy__4.0.2__e17982c2/",
  {
    name: "spdy",
    reference: "4.0.2"}],
  ["../../../../.esy/source/i/spdy_transport__3.0.0__86d31ec2/",
  {
    name: "spdy-transport",
    reference: "3.0.0"}],
  ["../../../../.esy/source/i/split_string__3.1.0__ba22f226/",
  {
    name: "split-string",
    reference: "3.1.0"}],
  ["../../../../.esy/source/i/ssri__6.0.2__5b284924/",
  {
    name: "ssri",
    reference: "6.0.2"}],
  ["../../../../.esy/source/i/static_extend__0.1.2__eef8a796/",
  {
    name: "static-extend",
    reference: "0.1.2"}],
  ["../../../../.esy/source/i/statuses__1.5.0__d1e84300/",
  {
    name: "statuses",
    reference: "1.5.0"}],
  ["../../../../.esy/source/i/statuses__2.0.1__3fcf4fcd/",
  {
    name: "statuses",
    reference: "2.0.1"}],
  ["../../../../.esy/source/i/stream_browserify__2.0.2__66efdbf4/",
  {
    name: "stream-browserify",
    reference: "2.0.2"}],
  ["../../../../.esy/source/i/stream_each__1.2.3__c1bc321e/",
  {
    name: "stream-each",
    reference: "1.2.3"}],
  ["../../../../.esy/source/i/stream_http__2.8.3__09a5a405/",
  {
    name: "stream-http",
    reference: "2.8.3"}],
  ["../../../../.esy/source/i/stream_shift__1.0.1__8e551aca/",
  {
    name: "stream-shift",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/string.prototype.trimend__1.0.5__4d7593d9/",
  {
    name: "string.prototype.trimend",
    reference: "1.0.5"}],
  ["../../../../.esy/source/i/string.prototype.trimstart__1.0.5__ab66e0e9/",
  {
    name: "string.prototype.trimstart",
    reference: "1.0.5"}],
  ["../../../../.esy/source/i/string__decoder__1.1.1__5c978813/",
  {
    name: "string_decoder",
    reference: "1.1.1"}],
  ["../../../../.esy/source/i/string__decoder__1.3.0__67179c58/",
  {
    name: "string_decoder",
    reference: "1.3.0"}],
  ["../../../../.esy/source/i/string_width__3.1.0__53bcc797/",
  {
    name: "string-width",
    reference: "3.1.0"}],
  ["../../../../.esy/source/i/strip_ansi__3.0.1__e5c8348d/",
  {
    name: "strip-ansi",
    reference: "3.0.1"}],
  ["../../../../.esy/source/i/strip_ansi__5.2.0__36e628b8/",
  {
    name: "strip-ansi",
    reference: "5.2.0"}],
  ["../../../../.esy/source/i/strip_eof__1.0.0__040453c2/",
  {
    name: "strip-eof",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/supports_color__5.5.0__0bed0829/",
  {
    name: "supports-color",
    reference: "5.5.0"}],
  ["../../../../.esy/source/i/supports_color__6.1.0__b84eee0f/",
  {
    name: "supports-color",
    reference: "6.1.0"}],
  ["../../../../.esy/source/i/tapable__1.1.3__05d5fc57/",
  {
    name: "tapable",
    reference: "1.1.3"}],
  ["../../../../.esy/source/i/terser__4.8.0__6d2cd164/",
  {
    name: "terser",
    reference: "4.8.0"}],
  ["../../../../.esy/source/i/terser_webpack_plugin__1.4.5__6ab60f58/",
  {
    name: "terser-webpack-plugin",
    reference: "1.4.5"}],
  ["../../../../.esy/source/i/through2__2.0.5__e5affbec/",
  {
    name: "through2",
    reference: "2.0.5"}],
  ["../../../../.esy/source/i/thunky__1.1.0__8ec9c25e/",
  {
    name: "thunky",
    reference: "1.1.0"}],
  ["../../../../.esy/source/i/timers_browserify__2.0.12__a94c4549/",
  {
    name: "timers-browserify",
    reference: "2.0.12"}],
  ["../../../../.esy/source/i/to_arraybuffer__1.0.1__2b9c3e7c/",
  {
    name: "to-arraybuffer",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/to_object_path__0.3.0__4e1644c7/",
  {
    name: "to-object-path",
    reference: "0.3.0"}],
  ["../../../../.esy/source/i/to_regex__3.0.2__1682d906/",
  {
    name: "to-regex",
    reference: "3.0.2"}],
  ["../../../../.esy/source/i/to_regex_range__2.1.1__ff8c30ef/",
  {
    name: "to-regex-range",
    reference: "2.1.1"}],
  ["../../../../.esy/source/i/to_regex_range__5.0.1__ddb0b8b0/",
  {
    name: "to-regex-range",
    reference: "5.0.1"}],
  ["../../../../.esy/source/i/toidentifier__1.0.1__94400347/",
  {
    name: "toidentifier",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/toposort__1.0.7__4097e897/",
  {
    name: "toposort",
    reference: "1.0.7"}],
  ["../../../../.esy/source/i/tty_browserify__0.0.0__21d4ad63/",
  {
    name: "tty-browserify",
    reference: "0.0.0"}],
  ["../../../../.esy/source/i/type_is__1.6.18__fa067d9a/",
  {
    name: "type-is",
    reference: "1.6.18"}],
  ["../../../../.esy/source/i/typedarray__0.0.6__a835dd2c/",
  {
    name: "typedarray",
    reference: "0.0.6"}],
  ["../../../../.esy/source/i/types__s__glob__7.2.0__718320bb/",
  {
    name: "@types/glob",
    reference: "7.2.0"}],
  ["../../../../.esy/source/i/types__s__minimatch__3.0.5__156d484a/",
  {
    name: "@types/minimatch",
    reference: "3.0.5"}],
  ["../../../../.esy/source/i/types__s__node__17.0.33__b5848ae5/",
  {
    name: "@types/node",
    reference: "17.0.33"}],
  ["../../../../.esy/source/i/uglify_js__3.4.10__7bbd9dcf/",
  {
    name: "uglify-js",
    reference: "3.4.10"}],
  ["../../../../.esy/source/i/unbox_primitive__1.0.2__0fb9cb29/",
  {
    name: "unbox-primitive",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/union_value__1.0.1__b1f6001d/",
  {
    name: "union-value",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/unique_filename__1.1.1__60f7543c/",
  {
    name: "unique-filename",
    reference: "1.1.1"}],
  ["../../../../.esy/source/i/unique_slug__2.0.2__df832348/",
  {
    name: "unique-slug",
    reference: "2.0.2"}],
  ["../../../../.esy/source/i/unpipe__1.0.0__ea4ca02f/",
  {
    name: "unpipe",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/unset_value__1.0.0__54969e15/",
  {
    name: "unset-value",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/upath__1.2.0__ee0f9072/",
  {
    name: "upath",
    reference: "1.2.0"}],
  ["../../../../.esy/source/i/upper_case__1.1.3__89a94b22/",
  {
    name: "upper-case",
    reference: "1.1.3"}],
  ["../../../../.esy/source/i/uri_js__4.4.1__7918c241/",
  {
    name: "uri-js",
    reference: "4.4.1"}],
  ["../../../../.esy/source/i/urix__0.1.0__578d889a/",
  {
    name: "urix",
    reference: "0.1.0"}],
  ["../../../../.esy/source/i/url__0.11.0__cf4e9a83/",
  {
    name: "url",
    reference: "0.11.0"}],
  ["../../../../.esy/source/i/url_parse__1.5.10__347f98af/",
  {
    name: "url-parse",
    reference: "1.5.10"}],
  ["../../../../.esy/source/i/use__3.1.1__6c794d09/",
  {
    name: "use",
    reference: "3.1.1"}],
  ["../../../../.esy/source/i/util.promisify__1.0.0__f3047ed8/",
  {
    name: "util.promisify",
    reference: "1.0.0"}],
  ["../../../../.esy/source/i/util__0.10.3__8f567c57/",
  {
    name: "util",
    reference: "0.10.3"}],
  ["../../../../.esy/source/i/util__0.11.1__068906b3/",
  {
    name: "util",
    reference: "0.11.1"}],
  ["../../../../.esy/source/i/util_deprecate__1.0.2__a0f4c1b2/",
  {
    name: "util-deprecate",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/utila__0.4.0__c83be81d/",
  {
    name: "utila",
    reference: "0.4.0"}],
  ["../../../../.esy/source/i/utils_merge__1.0.1__a3d5ce6b/",
  {
    name: "utils-merge",
    reference: "1.0.1"}],
  ["../../../../.esy/source/i/uuid__3.4.0__aded8d7a/",
  {
    name: "uuid",
    reference: "3.4.0"}],
  ["../../../../.esy/source/i/uuid__8.3.2__f1bd352f/",
  {
    name: "uuid",
    reference: "8.3.2"}],
  ["../../../../.esy/source/i/v8_compile_cache__2.3.0__d6237e0a/",
  {
    name: "v8-compile-cache",
    reference: "2.3.0"}],
  ["../../../../.esy/source/i/vary__1.1.2__3c2ea1ba/",
  {
    name: "vary",
    reference: "1.1.2"}],
  ["../../../../.esy/source/i/vm_browserify__1.1.2__7810c8f8/",
  {
    name: "vm-browserify",
    reference: "1.1.2"}],
  ["../../../../.esy/source/i/watchpack__1.7.5__ddcab962/",
  {
    name: "watchpack",
    reference: "1.7.5"}],
  ["../../../../.esy/source/i/watchpack_chokidar2__2.0.1__fae2d747/",
  {
    name: "watchpack-chokidar2",
    reference: "2.0.1"}],
  ["../../../../.esy/source/i/wbuf__1.7.3__67e2e9a2/",
  {
    name: "wbuf",
    reference: "1.7.3"}],
  ["../../../../.esy/source/i/webassemblyjs__s__ast__1.9.0__d4cc025e/",
  {
    name: "@webassemblyjs/ast",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__floating_point_hex_parser__1.9.0__934c6125/",
  {
    name: "@webassemblyjs/floating-point-hex-parser",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__helper_api_error__1.9.0__e3bba3ef/",
  {
    name: "@webassemblyjs/helper-api-error",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__helper_buffer__1.9.0__32a4feaa/",
  {
    name: "@webassemblyjs/helper-buffer",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__helper_code_frame__1.9.0__389a1573/",
  {
    name: "@webassemblyjs/helper-code-frame",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__helper_fsm__1.9.0__88273844/",
  {
    name: "@webassemblyjs/helper-fsm",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__helper_module_context__1.9.0__d1eb90b9/",
  {
    name: "@webassemblyjs/helper-module-context",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__helper_wasm_bytecode__1.9.0__2506753a/",
  {
    name: "@webassemblyjs/helper-wasm-bytecode",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__helper_wasm_section__1.9.0__9b161ce0/",
  {
    name: "@webassemblyjs/helper-wasm-section",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__ieee754__1.9.0__f54d7877/",
  {
    name: "@webassemblyjs/ieee754",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__leb128__1.9.0__b0baffbb/",
  {
    name: "@webassemblyjs/leb128",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__utf8__1.9.0__3bdfc84a/",
  {
    name: "@webassemblyjs/utf8",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__wasm_edit__1.9.0__c90fc51f/",
  {
    name: "@webassemblyjs/wasm-edit",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__wasm_gen__1.9.0__fa6a932a/",
  {
    name: "@webassemblyjs/wasm-gen",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__wasm_opt__1.9.0__e7c65a73/",
  {
    name: "@webassemblyjs/wasm-opt",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__wasm_parser__1.9.0__44b6ff45/",
  {
    name: "@webassemblyjs/wasm-parser",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__wast_parser__1.9.0__8e567739/",
  {
    name: "@webassemblyjs/wast-parser",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webassemblyjs__s__wast_printer__1.9.0__be988078/",
  {
    name: "@webassemblyjs/wast-printer",
    reference: "1.9.0"}],
  ["../../../../.esy/source/i/webpack__4.46.0__9508be9f/",
  {
    name: "webpack",
    reference: "4.46.0"}],
  ["../../../../.esy/source/i/webpack_cli__3.3.12__4fc89bd2/",
  {
    name: "webpack-cli",
    reference: "3.3.12"}],
  ["../../../../.esy/source/i/webpack_dev_middleware__3.7.3__e06556e1/",
  {
    name: "webpack-dev-middleware",
    reference: "3.7.3"}],
  ["../../../../.esy/source/i/webpack_dev_server__3.11.3__234f47c2/",
  {
    name: "webpack-dev-server",
    reference: "3.11.3"}],
  ["../../../../.esy/source/i/webpack_log__2.0.0__4d7a74d1/",
  {
    name: "webpack-log",
    reference: "2.0.0"}],
  ["../../../../.esy/source/i/webpack_sources__1.4.3__dcb5635e/",
  {
    name: "webpack-sources",
    reference: "1.4.3"}],
  ["../../../../.esy/source/i/websocket_driver__0.7.4__75644345/",
  {
    name: "websocket-driver",
    reference: "0.7.4"}],
  ["../../../../.esy/source/i/websocket_extensions__0.1.4__621ed9c0/",
  {
    name: "websocket-extensions",
    reference: "0.1.4"}],
  ["../../../../.esy/source/i/which__1.3.1__6a4208c5/",
  {
    name: "which",
    reference: "1.3.1"}],
  ["../../../../.esy/source/i/which_boxed_primitive__1.0.2__3437c718/",
  {
    name: "which-boxed-primitive",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/which_module__2.0.0__dbf9460d/",
  {
    name: "which-module",
    reference: "2.0.0"}],
  ["../../../../.esy/source/i/worker_farm__1.7.0__4e72c830/",
  {
    name: "worker-farm",
    reference: "1.7.0"}],
  ["../../../../.esy/source/i/wrap_ansi__5.1.0__316eee6b/",
  {
    name: "wrap-ansi",
    reference: "5.1.0"}],
  ["../../../../.esy/source/i/wrappy__1.0.2__5299ea53/",
  {
    name: "wrappy",
    reference: "1.0.2"}],
  ["../../../../.esy/source/i/ws__6.2.2__f2c23f07/",
  {
    name: "ws",
    reference: "6.2.2"}],
  ["../../../../.esy/source/i/xtend__4.0.2__aa4879b6/",
  {
    name: "xtend",
    reference: "4.0.2"}],
  ["../../../../.esy/source/i/xtuc__s__ieee754__1.2.0__2741d8fb/",
  {
    name: "@xtuc/ieee754",
    reference: "1.2.0"}],
  ["../../../../.esy/source/i/xtuc__s__long__4.2.2__1008afb9/",
  {
    name: "@xtuc/long",
    reference: "4.2.2"}],
  ["../../../../.esy/source/i/y18n__4.0.3__4dbf3ad1/",
  {
    name: "y18n",
    reference: "4.0.3"}],
  ["../../../../.esy/source/i/yallist__3.1.1__49ae508b/",
  {
    name: "yallist",
    reference: "3.1.1"}],
  ["../../../../.esy/source/i/yargs__13.3.2__2904cec0/",
  {
    name: "yargs",
    reference: "13.3.2"}],
  ["../../../../.esy/source/i/yargs_parser__13.1.2__cada26e0/",
  {
    name: "yargs-parser",
    reference: "13.1.2"}]]);


  exports.findPackageLocator = function findPackageLocator(location) {
    let relativeLocation = normalizePath(path.relative(__dirname, location));

    if (!relativeLocation.match(isStrictRegExp))
      relativeLocation = `./${relativeLocation}`;

    if (location.match(isDirRegExp) && relativeLocation.charAt(relativeLocation.length - 1) !== '/')
      relativeLocation = `${relativeLocation}/`;

    let match;

  
      if (relativeLocation.length >= 87 && relativeLocation[86] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 87)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 83 && relativeLocation[82] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 83)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 82 && relativeLocation[81] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 82)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 81 && relativeLocation[80] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 81)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 79 && relativeLocation[78] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 79)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 78 && relativeLocation[77] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 78)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 76 && relativeLocation[75] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 76)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 75 && relativeLocation[74] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 75)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 74 && relativeLocation[73] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 74)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 73 && relativeLocation[72] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 73)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 72 && relativeLocation[71] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 72)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 71 && relativeLocation[70] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 71)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 70 && relativeLocation[69] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 70)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 69 && relativeLocation[68] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 69)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 68 && relativeLocation[67] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 68)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 67 && relativeLocation[66] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 67)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 66 && relativeLocation[65] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 66)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 65 && relativeLocation[64] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 65)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 64 && relativeLocation[63] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 64)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 63 && relativeLocation[62] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 63)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 62 && relativeLocation[61] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 62)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 61 && relativeLocation[60] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 61)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 60 && relativeLocation[59] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 60)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 59 && relativeLocation[58] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 59)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 58 && relativeLocation[57] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 58)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 57 && relativeLocation[56] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 57)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 56 && relativeLocation[55] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 56)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 55 && relativeLocation[54] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 55)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 54 && relativeLocation[53] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 54)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 53 && relativeLocation[52] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 53)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 52 && relativeLocation[51] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 52)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 51 && relativeLocation[50] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 51)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 50 && relativeLocation[49] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 50)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 49 && relativeLocation[48] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 49)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 48 && relativeLocation[47] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 48)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 47 && relativeLocation[46] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 47)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 46 && relativeLocation[45] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 46)))
          return blacklistCheck(match);
      

      if (relativeLocation.length >= 6 && relativeLocation[5] === '/')
        if (match = locatorsByLocations.get(relativeLocation.substr(0, 6)))
          return blacklistCheck(match);
      

    /*
      this can only happen if inside the _esy
      as any other path will implies the opposite

      topLevelLocatorPath = ../../

      | folder              | relativeLocation |
      | ------------------- | ---------------- |
      | /workspace/app      | ../../           |
      | /workspace          | ../../../        |
      | /workspace/app/x    | ../../x/         |
      | /workspace/app/_esy | ../              |

    */
    if (!relativeLocation.startsWith(topLevelLocatorPath)) {
      return topLevelLocator;
    }
    return null;
  };
  

/**
 * Returns the module that should be used to resolve require calls. It's usually the direct parent, except if we're
 * inside an eval expression.
 */

function getIssuerModule(parent) {
  let issuer = parent;

  while (issuer && (issuer.id === '[eval]' || issuer.id === '<repl>' || !issuer.filename)) {
    issuer = issuer.parent;
  }

  return issuer;
}

/**
 * Returns information about a package in a safe way (will throw if they cannot be retrieved)
 */

function getPackageInformationSafe(packageLocator) {
  const packageInformation = exports.getPackageInformation(packageLocator);

  if (!packageInformation) {
    throw makeError(
      `INTERNAL`,
      `Couldn't find a matching entry in the dependency tree for the specified parent (this is probably an internal error)`
    );
  }

  return packageInformation;
}

/**
 * Implements the node resolution for folder access and extension selection
 */

function applyNodeExtensionResolution(unqualifiedPath, {extensions}) {
  // We use this "infinite while" so that we can restart the process as long as we hit package folders
  while (true) {
    let stat;

    try {
      stat = statSync(unqualifiedPath);
    } catch (error) {}

    // If the file exists and is a file, we can stop right there

    if (stat && !stat.isDirectory()) {
      // If the very last component of the resolved path is a symlink to a file, we then resolve it to a file. We only
      // do this first the last component, and not the rest of the path! This allows us to support the case of bin
      // symlinks, where a symlink in "/xyz/pkg-name/.bin/bin-name" will point somewhere else (like "/xyz/pkg-name/index.js").
      // In such a case, we want relative requires to be resolved relative to "/xyz/pkg-name/" rather than "/xyz/pkg-name/.bin/".
      //
      // Also note that the reason we must use readlink on the last component (instead of realpath on the whole path)
      // is that we must preserve the other symlinks, in particular those used by pnp to deambiguate packages using
      // peer dependencies. For example, "/xyz/.pnp/local/pnp-01234569/.bin/bin-name" should see its relative requires
      // be resolved relative to "/xyz/.pnp/local/pnp-0123456789/" rather than "/xyz/pkg-with-peers/", because otherwise
      // we would lose the information that would tell us what are the dependencies of pkg-with-peers relative to its
      // ancestors.

      if (lstatSync(unqualifiedPath).isSymbolicLink()) {
        unqualifiedPath = path.normalize(path.resolve(path.dirname(unqualifiedPath), readlinkSync(unqualifiedPath)));
      }

      return unqualifiedPath;
    }

    // If the file is a directory, we must check if it contains a package.json with a "main" entry

    if (stat && stat.isDirectory()) {
      let pkgJson;

      try {
        pkgJson = JSON.parse(readFileSync(`${unqualifiedPath}/package.json`, 'utf-8'));
      } catch (error) {}

      let nextUnqualifiedPath;

      if (pkgJson && pkgJson.main) {
        nextUnqualifiedPath = path.resolve(unqualifiedPath, pkgJson.main);
      }

      // If the "main" field changed the path, we start again from this new location

      if (nextUnqualifiedPath && nextUnqualifiedPath !== unqualifiedPath) {
        const resolution = applyNodeExtensionResolution(nextUnqualifiedPath, {extensions});

        if (resolution !== null) {
          return resolution;
        }
      }
    }

    // Otherwise we check if we find a file that match one of the supported extensions

    const qualifiedPath = extensions
      .map(extension => {
        return `${unqualifiedPath}${extension}`;
      })
      .find(candidateFile => {
        return existsSync(candidateFile);
      });

    if (qualifiedPath) {
      return qualifiedPath;
    }

    // Otherwise, we check if the path is a folder - in such a case, we try to use its index

    if (stat && stat.isDirectory()) {
      const indexPath = extensions
        .map(extension => {
          return `${unqualifiedPath}/index${extension}`;
        })
        .find(candidateFile => {
          return existsSync(candidateFile);
        });

      if (indexPath) {
        return indexPath;
      }
    }

    // Otherwise there's nothing else we can do :(

    return null;
  }
}

/**
 * This function creates fake modules that can be used with the _resolveFilename function.
 * Ideally it would be nice to be able to avoid this, since it causes useless allocations
 * and cannot be cached efficiently (we recompute the nodeModulePaths every time).
 *
 * Fortunately, this should only affect the fallback, and there hopefully shouldn't be a
 * lot of them.
 */

function makeFakeModule(path) {
  const fakeModule = new Module(path, false);
  fakeModule.filename = path;
  fakeModule.paths = Module._nodeModulePaths(path);
  return fakeModule;
}

/**
 * Normalize path to posix format.
 */

// eslint-disable-next-line no-unused-vars
function normalizePath(fsPath) {
  fsPath = path.normalize(fsPath);

  if (process.platform === 'win32') {
    fsPath = fsPath.replace(backwardSlashRegExp, '/');
  }

  return fsPath;
}

/**
 * Forward the resolution to the next resolver (usually the native one)
 */

function callNativeResolution(request, issuer) {
  if (issuer.endsWith('/')) {
    issuer += 'internal.js';
  }

  try {
    enableNativeHooks = false;

    // Since we would need to create a fake module anyway (to call _resolveLookupPath that
    // would give us the paths to give to _resolveFilename), we can as well not use
    // the {paths} option at all, since it internally makes _resolveFilename create another
    // fake module anyway.
    return Module._resolveFilename(request, makeFakeModule(issuer), false);
  } finally {
    enableNativeHooks = true;
  }
}

/**
 * This key indicates which version of the standard is implemented by this resolver. The `std` key is the
 * Plug'n'Play standard, and any other key are third-party extensions. Third-party extensions are not allowed
 * to override the standard, and can only offer new methods.
 *
 * If an new version of the Plug'n'Play standard is released and some extensions conflict with newly added
 * functions, they'll just have to fix the conflicts and bump their own version number.
 */

exports.VERSIONS = {std: 1};

/**
 * Useful when used together with getPackageInformation to fetch information about the top-level package.
 */

exports.topLevel = {name: null, reference: null};

/**
 * Gets the package information for a given locator. Returns null if they cannot be retrieved.
 */

exports.getPackageInformation = function getPackageInformation({name, reference}) {
  const packageInformationStore = packageInformationStores.get(name);

  if (!packageInformationStore) {
    return null;
  }

  const packageInformation = packageInformationStore.get(reference);

  if (!packageInformation) {
    return null;
  }

  return packageInformation;
};

/**
 * Transforms a request (what's typically passed as argument to the require function) into an unqualified path.
 * This path is called "unqualified" because it only changes the package name to the package location on the disk,
 * which means that the end result still cannot be directly accessed (for example, it doesn't try to resolve the
 * file extension, or to resolve directories to their "index.js" content). Use the "resolveUnqualified" function
 * to convert them to fully-qualified paths, or just use "resolveRequest" that do both operations in one go.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveToUnqualified = function resolveToUnqualified(request, issuer, {considerBuiltins = true} = {}) {
  // The 'pnpapi' request is reserved and will always return the path to the PnP file, from everywhere

  if (request === `pnpapi`) {
    return pnpFile;
  }

  // Bailout if the request is a native module

  if (considerBuiltins && builtinModules.has(request)) {
    return null;
  }

  // We allow disabling the pnp resolution for some subpaths. This is because some projects, often legacy,
  // contain multiple levels of dependencies (ie. a yarn.lock inside a subfolder of a yarn.lock). This is
  // typically solved using workspaces, but not all of them have been converted already.

  if (ignorePattern && ignorePattern.test(normalizePath(issuer))) {
    const result = callNativeResolution(request, issuer);

    if (result === false) {
      throw makeError(
        `BUILTIN_NODE_RESOLUTION_FAIL`,
        `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer was explicitely ignored by the regexp "$$BLACKLIST")`,
        {
          request,
          issuer
        }
      );
    }

    return result;
  }

  let unqualifiedPath;

  // If the request is a relative or absolute path, we just return it normalized

  const dependencyNameMatch = request.match(pathRegExp);

  if (!dependencyNameMatch) {
    if (path.isAbsolute(request)) {
      unqualifiedPath = path.normalize(request);
    } else if (issuer.match(isDirRegExp)) {
      unqualifiedPath = path.normalize(path.resolve(issuer, request));
    } else {
      unqualifiedPath = path.normalize(path.resolve(path.dirname(issuer), request));
    }
  }

  // Things are more hairy if it's a package require - we then need to figure out which package is needed, and in
  // particular the exact version for the given location on the dependency tree

  if (dependencyNameMatch) {
    const [, dependencyName, subPath] = dependencyNameMatch;

    const issuerLocator = exports.findPackageLocator(issuer);

    // If the issuer file doesn't seem to be owned by a package managed through pnp, then we resort to using the next
    // resolution algorithm in the chain, usually the native Node resolution one

    if (!issuerLocator) {
      const result = callNativeResolution(request, issuer);

      if (result === false) {
        throw makeError(
          `BUILTIN_NODE_RESOLUTION_FAIL`,
          `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer doesn't seem to be part of the Yarn-managed dependency tree)`,
          {
            request,
            issuer
          },
        );
      }

      return result;
    }

    const issuerInformation = getPackageInformationSafe(issuerLocator);

    // We obtain the dependency reference in regard to the package that request it

    let dependencyReference = issuerInformation.packageDependencies.get(dependencyName);

    // If we can't find it, we check if we can potentially load it from the packages that have been defined as potential fallbacks.
    // It's a bit of a hack, but it improves compatibility with the existing Node ecosystem. Hopefully we should eventually be able
    // to kill this logic and become stricter once pnp gets enough traction and the affected packages fix themselves.

    if (issuerLocator !== topLevelLocator) {
      for (let t = 0, T = fallbackLocators.length; dependencyReference === undefined && t < T; ++t) {
        const fallbackInformation = getPackageInformationSafe(fallbackLocators[t]);
        dependencyReference = fallbackInformation.packageDependencies.get(dependencyName);
      }
    }

    // If we can't find the path, and if the package making the request is the top-level, we can offer nicer error messages

    if (!dependencyReference) {
      if (dependencyReference === null) {
        if (issuerLocator === topLevelLocator) {
          throw makeError(
            `MISSING_PEER_DEPENDENCY`,
            `You seem to be requiring a peer dependency ("${dependencyName}"), but it is not installed (which might be because you're the top-level package)`,
            {request, issuer, dependencyName},
          );
        } else {
          throw makeError(
            `MISSING_PEER_DEPENDENCY`,
            `Package "${issuerLocator.name}@${issuerLocator.reference}" is trying to access a peer dependency ("${dependencyName}") that should be provided by its direct ancestor but isn't`,
            {request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName},
          );
        }
      } else {
        if (issuerLocator === topLevelLocator) {
          throw makeError(
            `UNDECLARED_DEPENDENCY`,
            `You cannot require a package ("${dependencyName}") that is not declared in your dependencies (via "${issuer}")`,
            {request, issuer, dependencyName},
          );
        } else {
          const candidates = Array.from(issuerInformation.packageDependencies.keys());
          throw makeError(
            `UNDECLARED_DEPENDENCY`,
            `Package "${issuerLocator.name}@${issuerLocator.reference}" (via "${issuer}") is trying to require the package "${dependencyName}" (via "${request}") without it being listed in its dependencies (${candidates.join(
              `, `,
            )})`,
            {request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName, candidates},
          );
        }
      }
    }

    // We need to check that the package exists on the filesystem, because it might not have been installed

    const dependencyLocator = {name: dependencyName, reference: dependencyReference};
    const dependencyInformation = exports.getPackageInformation(dependencyLocator);
    const dependencyLocation = path.resolve(__dirname, dependencyInformation.packageLocation);

    if (!dependencyLocation) {
      throw makeError(
        `MISSING_DEPENDENCY`,
        `Package "${dependencyLocator.name}@${dependencyLocator.reference}" is a valid dependency, but hasn't been installed and thus cannot be required (it might be caused if you install a partial tree, such as on production environments)`,
        {request, issuer, dependencyLocator: Object.assign({}, dependencyLocator)},
      );
    }

    // Now that we know which package we should resolve to, we only have to find out the file location

    if (subPath) {
      unqualifiedPath = path.resolve(dependencyLocation, subPath);
    } else {
      unqualifiedPath = dependencyLocation;
    }
  }

  return path.normalize(unqualifiedPath);
};

/**
 * Transforms an unqualified path into a qualified path by using the Node resolution algorithm (which automatically
 * appends ".js" / ".json", and transforms directory accesses into "index.js").
 */

exports.resolveUnqualified = function resolveUnqualified(
  unqualifiedPath,
  {extensions = Object.keys(Module._extensions)} = {},
) {
  const qualifiedPath = applyNodeExtensionResolution(unqualifiedPath, {extensions});

  if (qualifiedPath) {
    return path.normalize(qualifiedPath);
  } else {
    throw makeError(
      `QUALIFIED_PATH_RESOLUTION_FAILED`,
      `Couldn't find a suitable Node resolution for unqualified path "${unqualifiedPath}"`,
      {unqualifiedPath},
    );
  }
};

/**
 * Transforms a request into a fully qualified path.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveRequest = function resolveRequest(request, issuer, {considerBuiltins, extensions} = {}) {
  let unqualifiedPath;

  try {
    unqualifiedPath = exports.resolveToUnqualified(request, issuer, {considerBuiltins});
  } catch (originalError) {
    // If we get a BUILTIN_NODE_RESOLUTION_FAIL error there, it means that we've had to use the builtin node
    // resolution, which usually shouldn't happen. It might be because the user is trying to require something
    // from a path loaded through a symlink (which is not possible, because we need something normalized to
    // figure out which package is making the require call), so we try to make the same request using a fully
    // resolved issuer and throws a better and more actionable error if it works.
    if (originalError.code === `BUILTIN_NODE_RESOLUTION_FAIL`) {
      let realIssuer;

      try {
        realIssuer = realpathSync(issuer);
      } catch (error) {}

      if (realIssuer) {
        if (issuer.endsWith(`/`)) {
          realIssuer = realIssuer.replace(/\/?$/, `/`);
        }

        try {
          exports.resolveToUnqualified(request, realIssuer, {extensions});
        } catch (error) {
          // If an error was thrown, the problem doesn't seem to come from a path not being normalized, so we
          // can just throw the original error which was legit.
          throw originalError;
        }

        // If we reach this stage, it means that resolveToUnqualified didn't fail when using the fully resolved
        // file path, which is very likely caused by a module being invoked through Node with a path not being
        // correctly normalized (ie you should use "node $(realpath script.js)" instead of "node script.js").
        throw makeError(
          `SYMLINKED_PATH_DETECTED`,
          `A pnp module ("${request}") has been required from what seems to be a symlinked path ("${issuer}"). This is not possible, you must ensure that your modules are invoked through their fully resolved path on the filesystem (in this case "${realIssuer}").`,
          {
            request,
            issuer,
            realIssuer
          },
        );
      }
    }
    throw originalError;
  }

  if (unqualifiedPath === null) {
    return null;
  }

  try {
    return exports.resolveUnqualified(unqualifiedPath);
  } catch (resolutionError) {
    if (resolutionError.code === 'QUALIFIED_PATH_RESOLUTION_FAILED') {
      Object.assign(resolutionError.data, {request, issuer});
    }
    throw resolutionError;
  }
};

/**
 * Setups the hook into the Node environment.
 *
 * From this point on, any call to `require()` will go through the "resolveRequest" function, and the result will
 * be used as path of the file to load.
 */

exports.setup = function setup() {
  // A small note: we don't replace the cache here (and instead use the native one). This is an effort to not
  // break code similar to "delete require.cache[require.resolve(FOO)]", where FOO is a package located outside
  // of the Yarn dependency tree. In this case, we defer the load to the native loader. If we were to replace the
  // cache by our own, the native loader would populate its own cache, which wouldn't be exposed anymore, so the
  // delete call would be broken.

  const originalModuleLoad = Module._load;

  Module._load = function(request, parent, isMain) {
    if (!enableNativeHooks) {
      return originalModuleLoad.call(Module, request, parent, isMain);
    }

    // Builtins are managed by the regular Node loader

    if (builtinModules.has(request)) {
      try {
        enableNativeHooks = false;
        return originalModuleLoad.call(Module, request, parent, isMain);
      } finally {
        enableNativeHooks = true;
      }
    }

    // The 'pnpapi' name is reserved to return the PnP api currently in use by the program

    if (request === `pnpapi`) {
      return pnpModule.exports;
    }

    // Request `Module._resolveFilename` (ie. `resolveRequest`) to tell us which file we should load

    const modulePath = Module._resolveFilename(request, parent, isMain);

    // Check if the module has already been created for the given file

    const cacheEntry = Module._cache[modulePath];

    if (cacheEntry) {
      return cacheEntry.exports;
    }

    // Create a new module and store it into the cache

    const module = new Module(modulePath, parent);
    Module._cache[modulePath] = module;

    // The main module is exposed as global variable

    if (isMain) {
      process.mainModule = module;
      module.id = '.';
    }

    // Try to load the module, and remove it from the cache if it fails

    let hasThrown = true;

    try {
      module.load(modulePath);
      hasThrown = false;
    } finally {
      if (hasThrown) {
        delete Module._cache[modulePath];
      }
    }

    // Some modules might have to be patched for compatibility purposes

    if (patchedModules.has(request)) {
      module.exports = patchedModules.get(request)(module.exports);
    }

    return module.exports;
  };

  const originalModuleResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function(request, parent, isMain, options) {
    if (!enableNativeHooks) {
      return originalModuleResolveFilename.call(Module, request, parent, isMain, options);
    }

    const issuerModule = getIssuerModule(parent);
    const issuer = issuerModule ? issuerModule.filename : process.cwd() + '/';

    const resolution = exports.resolveRequest(request, issuer);
    return resolution !== null ? resolution : request;
  };

  const originalFindPath = Module._findPath;

  Module._findPath = function(request, paths, isMain) {
    if (!enableNativeHooks) {
      return originalFindPath.call(Module, request, paths, isMain);
    }

    for (const path of paths || []) {
      let resolution;

      try {
        resolution = exports.resolveRequest(request, path);
      } catch (error) {
        continue;
      }

      if (resolution) {
        return resolution;
      }
    }

    return false;
  };

  process.versions.pnp = String(exports.VERSIONS.std);

  if (process.env.ESY__NODE_BIN_PATH != null) {
    const delimiter = require('path').delimiter;
    process.env.PATH = `${process.env.ESY__NODE_BIN_PATH}${delimiter}${process.env.PATH}`;
  }
};

exports.setupCompatibilityLayer = () => {
  // see https://github.com/browserify/resolve/blob/master/lib/caller.js
  const getCaller = () => {
    const origPrepareStackTrace = Error.prepareStackTrace;

    Error.prepareStackTrace = (_, stack) => stack;
    const stack = new Error().stack;
    Error.prepareStackTrace = origPrepareStackTrace;

    return stack[2].getFileName();
  };

  // ESLint currently doesn't have any portable way for shared configs to specify their own
  // plugins that should be used (https://github.com/eslint/eslint/issues/10125). This will
  // likely get fixed at some point, but it'll take time and in the meantime we'll just add
  // additional fallback entries for common shared configs.

  for (const name of [`react-scripts`]) {
    const packageInformationStore = packageInformationStores.get(name);
    if (packageInformationStore) {
      for (const reference of packageInformationStore.keys()) {
        fallbackLocators.push({name, reference});
      }
    }
  }

  // We need to shim the "resolve" module, because Liftoff uses it in order to find the location
  // of the module in the dependency tree. And Liftoff is used to power Gulp, which doesn't work
  // at all unless modulePath is set, which we cannot configure from any other way than through
  // the Liftoff pipeline (the key isn't whitelisted for env or cli options).

  patchedModules.set(/^resolve$/, realResolve => {
    const mustBeShimmed = caller => {
      const callerLocator = exports.findPackageLocator(caller);

      return callerLocator && callerLocator.name === 'liftoff';
    };

    const attachCallerToOptions = (caller, options) => {
      if (!options.basedir) {
        options.basedir = path.dirname(caller);
      }
    };

    const resolveSyncShim = (request, {basedir}) => {
      return exports.resolveRequest(request, basedir, {
        considerBuiltins: false,
      });
    };

    const resolveShim = (request, options, callback) => {
      setImmediate(() => {
        let error;
        let result;

        try {
          result = resolveSyncShim(request, options);
        } catch (thrown) {
          error = thrown;
        }

        callback(error, result);
      });
    };

    return Object.assign(
      (request, options, callback) => {
        if (typeof options === 'function') {
          callback = options;
          options = {};
        } else if (!options) {
          options = {};
        }

        const caller = getCaller();
        attachCallerToOptions(caller, options);

        if (mustBeShimmed(caller)) {
          return resolveShim(request, options, callback);
        } else {
          return realResolve.sync(request, options, callback);
        }
      },
      {
        sync: (request, options) => {
          if (!options) {
            options = {};
          }

          const caller = getCaller();
          attachCallerToOptions(caller, options);

          if (mustBeShimmed(caller)) {
            return resolveSyncShim(request, options);
          } else {
            return realResolve.sync(request, options);
          }
        },
        isCore: request => {
          return realResolve.isCore(request);
        }
      }
    );
  });
};

if (module.parent && module.parent.id === 'internal/preload') {
  exports.setupCompatibilityLayer();

  exports.setup();
}

if (process.mainModule === module) {
  exports.setupCompatibilityLayer();

  const reportError = (code, message, data) => {
    process.stdout.write(`${JSON.stringify([{code, message, data}, null])}\n`);
  };

  const reportSuccess = resolution => {
    process.stdout.write(`${JSON.stringify([null, resolution])}\n`);
  };

  const processResolution = (request, issuer) => {
    try {
      reportSuccess(exports.resolveRequest(request, issuer));
    } catch (error) {
      reportError(error.code, error.message, error.data);
    }
  };

  const processRequest = data => {
    try {
      const [request, issuer] = JSON.parse(data);
      processResolution(request, issuer);
    } catch (error) {
      reportError(`INVALID_JSON`, error.message, error.data);
    }
  };

  if (process.argv.length > 2) {
    if (process.argv.length !== 4) {
      process.stderr.write(`Usage: ${process.argv[0]} ${process.argv[1]} <request> <issuer>\n`);
      process.exitCode = 64; /* EX_USAGE */
    } else {
      processResolution(process.argv[2], process.argv[3]);
    }
  } else {
    let buffer = '';
    const decoder = new StringDecoder.StringDecoder();

    process.stdin.on('data', chunk => {
      buffer += decoder.write(chunk);

      do {
        const index = buffer.indexOf('\n');
        if (index === -1) {
          break;
        }

        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);

        processRequest(line);
      } while (true);
    });
  }
}
