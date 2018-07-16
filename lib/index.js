"use strict";

const fs = require("fs");
const fspath = require("path");
const read = require("fs-readdir-recursive");
var xmldoc = require("xmldoc");
const mkdirp = require("mkdirp");

module.exports.testsuiteCount = 0;
module.exports.testsuites = [];

var testCount = 0;
var testTime = 0;
var testFailures = 0;

/**
 * Read XML from file
 * @param {string} fileName
 */
function parseXmlFromFile(fileName) {
  try {
    var xmlFile = fs.readFileSync(fileName, "utf8");
    var xmlDoc = new xmldoc.XmlDocument(xmlFile);

    // Single testsuite, not wrapped in a testsuites
    if (xmlDoc.name === "testsuite") {
      module.exports.testsuites = xmlDoc;
      module.exports.testsuiteCount = 1;
    } else {
      // Multiple testsuites, wrapped in a parent
      module.exports.testsuites = xmlDoc.childrenNamed("testsuite");
      module.exports.testsuiteCount = module.exports.testsuites.length;
    }

    return xmlDoc;
  } catch (e) {
    if (e.code === "ENOENT") {
      // Bad directory
      return "File not found";
    }
    // Unknown error
    return e;
  }
}

/**
 * List all XML files in directory
 * @param {*} path
 * @param {*} recursive
 */
function listXmlFiles(path, recursive) {
  try {
    var allFiles = recursive ? read(path) : fs.readdirSync(path);

    var xmlFiles = allFiles
      .map(function(file) {
        return fspath.join(path, file);
      })
      // Fiter out non-files
      .filter(function(file) {
        return fs.statSync(file).isFile();
      })
      // Only return files ending in '.xml'
      .filter(function(file) {
        return file.slice(-4) === ".xml";
      });
    // No files returned
    if (!xmlFiles.length > 0) {
      return new Error("No xml files found");
    } else {
      // Return the array of files ending in '.xml'
      return xmlFiles;
    }
  } catch (e) {
    throw e;
  }
}

function addMetadata(xmlFile) {
  if (xmlFile.attr && xmlFile.attr.tests) {
    testCount += parseInt(xmlFile.attr.tests);
  }
  if (xmlFile.attr && xmlFile.attr.failures) {
    testFailures += parseInt(xmlFile.attr.failures);
  }
  if (xmlFile.attr && xmlFile.attr.time) {
    testTime += parseFloat(xmlFile.attr.time);
  }
}

/**
 * Extract JUNIT test suites from XML
 * @param {*} filename
 */
function getTestsuites(filename) {
  var xmlFile = parseXmlFromFile(filename);
  if (xmlFile === "File not found") {
    throw new Error("File not found");
  } else {
    try {
      var testsuites = "";
      // Single testsuite, not wrapped in a testsuites
      if (xmlFile.name === "testsuite") {
        addMetadata(xmlFile)
        return xmlFile.toString();
      } else {
        // Multiple testsuites, wrapped in a parent
        var testsuitesXml = xmlFile.childrenNamed("testsuite");
        testsuitesXml.forEach(function(testsuite) {
          addMetadata(xmlFile)
          testsuites += testsuite.toString() + "\n";
        });
        return testsuites;
      }
    } catch (e) {
      if (e.message === "xmlFile.childrenNamed is not a function") {
        throw new Error("No tests found");
      } else {
        return e;
      }
    }
  }
}

function mergeFiles(files, name) {
  var mergedTestSuites = "";
  let mergedFile = "";
  files.forEach(function(file) {
    try {
      var res = getTestsuites(file);
      mergedTestSuites += res + "\n";
      if (mergedTestSuites === "") {
        throw new Error("No tests found");
      }
    } catch (err) {
      if (err.message != "No tests found") {
        console.error(err);
        throw err;
      }
    }
  });
  mergedFile =
    '<?xml version="1.0"?>\n' +
    "<testsuites name=\"" + name + "\" tests=\"" + testCount +"\" failures=\"" + testFailures + "\" time=\"" + testTime + "\">\n" +
    mergedTestSuites +
    "</testsuites>";
  return mergedFile;
}

function writeMergedFile(file, data, createOutputDir) {
  try {
    fs.writeFileSync(file, data);
  } catch (error) {
    if (error.code == "ENOENT") {
      if (createOutputDir) {
        mkdirp.sync(file.substr(0, file.lastIndexOf("/")));
        fs.writeFileSync(file, data);
      } else {
        throw new Error("Missing output directory");
      }
    }
  }
}

module.exports = {
  listXmlFiles,
  mergeFiles,
  getTestsuites,
  writeMergedFile,
};
