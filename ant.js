var async = require('async');
var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;
var xml2js = require('xml2js');

var config = require('./config');
var log = require('./logger').cat('ant');

// run a compilation task
// callback returns true iff Ant exists normally
exports.compile = function(spec, builddir, target, output, callback) {
  log.info({ spec: spec }, 'compile', builddir, target, output);
  spawn('ant', [
    '-Declipse.home', config.build.eclipse,
    '-logfile', output + '.txt',
    target
  ], {
    cwd: builddir
  }).on('exit', function(code) {
    callback(null, code == 0);
  });
}

// run a JUnit task and parse the XML report
// callback returns true iff Ant exits normally and tests passed
exports.test = function(spec, builddir, target, output, callback) {
  log.info({ spec: spec }, 'test', builddir, target, output);
  spawn('ant', [
    '-Declipse.home', config.build.eclipse,
    '-logfile', output + '.txt',
    target
  ], {
    cwd: builddir
  }).on('exit', function(code) {
    exports.parseJUnitResults(code, path.join(builddir, 'TESTS-TestSuites.xml'), function(err, results) {
      if (err) {
        callback(err);
        return;
      }
      fs.writeFile(output + '.json', JSON.stringify(results), function(err) {
        if (err) {
          err.dmesg = 'error writing test results';
        }
        callback(err, code == 0 && results.tests > 0 && results.failures == 0 && results.errors == 0);
      })
    });
  });
};

// parse a JUnit test report
// callback returns a JSONable structure
exports.parseJUnitResults = function(code, report, callback) {
  var result = { testsuites: [], tests: 0, failures: 0, errors: 0 };
  if (code != 0) {
    log.info('parseJUnitResults', 'not reading errorful report file');
    callback(null, result);
    return;
  }
  fs.readFile(report, { encoding: 'utf8' }, function(err, data) {
    if (err) {
      log.warn('parseJUnitResults', 'no report file');
      callback(null, result);
      return;
    }
    (new xml2js.Parser()).parseString(data, function(err, xml) {
      if (err) {
        err.dmesg = 'error parsing unit test report';
        callback(err);
        return;
      }
      var propfix = /^didit\./;
      (xml.testsuites.testsuite || []).forEach(function(suite) {
        var suiteJSON = suite.$;
        suiteJSON.properties = {};
        suite.properties[0].property.filter(function(prop) {
          return propfix.test(prop.$.name);
        }).forEach(function(prop) {
          suiteJSON.properties[prop.$.name.replace(propfix, '')] = prop.$.value;
        });
        suiteJSON.sysout = (suite['system-out'] || []).filter(function(line) {
          return line.constructor == String;
        });
        suiteJSON.syserr = (suite['system-err'] || []).filter(function(line) {
          return line.constructor == String;
        });
        suiteJSON.testcases = (suite.testcase || []).map(function(test) {
          var testJSON = test.$;
          testJSON.error = test.error && test.error[0]._;
          testJSON.failure = test.failure && test.failure[0]._;
          return testJSON;
        });
        result.testsuites.push(suiteJSON);
        [ 'tests', 'failures', 'errors' ].forEach(function(thing) {
          result[thing] += parseInt(suiteJSON[thing]);
        });
      });
      callback(null, result);
    });
  });
}
