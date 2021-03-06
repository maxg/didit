const async = require('async');
const fs = require('fs');
const path = require('path');
const spawn = require('child_process').spawn;
const xml2js = require('xml2js');

const config = require('./config');
const log = require('./logger').cat('ant');

// run a compilation task
// callback returns an object where "success" is true iff Ant exits normally
exports.compile = function(spec, builddir, target, output, callback) {
  log.info({ spec }, 'compile', builddir, target, output);
  spawn('ant', [
    '-Declipse.home', config.build.eclipse,
    '-logfile', output + '.txt',
    target
  ], {
    cwd: builddir
  }).on('exit', function(code) {
    callback(null, {
      success: code == 0
    });
  });
}

// run a JUnit task and parse the XML report
// callback returns an object where "success" is true iff Ant exits normally and tests passed
exports.test = function(spec, builddir, target, output, callback) {
  log.info({ spec }, 'test', builddir, target, output);
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
        callback(err, {
          success: code == 0 && results.tests > 0 && results.failures == 0 && results.errors == 0,
          result: results
        });
      });
    });
  });
};

// parse a JUnit test report
// callback returns a JSONable structure
exports.parseJUnitResults = function(code, report, callback) {
  let result = { testsuites: [], tests: 0, failures: 0, errors: 0 };
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
      let propfix = /^didit\./;
      (xml.testsuites.testsuite || []).forEach(function(suite) {
        let suiteJSON = suite.$;
        suiteJSON.properties = {};
        (suite.properties || []).forEach(function(properties) {
          properties.property.filter(function(prop) {
            return propfix.test(prop.$.name);
          }).forEach(function(prop) {
            suiteJSON.properties[prop.$.name.replace(propfix, '')] = prop.$.value;
          });
        });
        suiteJSON.sysout = (suite['system-out'] || []).filter(function(line) {
          return line.constructor == String;
        });
        suiteJSON.syserr = (suite['system-err'] || []).filter(function(line) {
          return line.constructor == String;
        });
        suiteJSON.testcases = (suite.testcase || []).filter(function(test) {
          return ! test.skipped;
        }).map(function(test) {
          let testJSON = test.$;
          testJSON.error = test.error && (test.error[0]._ || test.error[0]);
          testJSON.failure = test.failure && (test.failure[0]._ || test.failure[0]);
          if (test.payload) {
            testJSON.payload = test.payload[0].$;
            testJSON.payload.data = test.payload[0]._;
          }
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

// command-line parse
if (require.main === module) {
  let args = process.argv.slice(2);
  if ( ! args.join(' ').match(/^.+\.xml .+\.json$/)) {
    log.error('expected argument: <input.xml> <output.json>');
    return;
  }
  exports.parseJUnitResults(0, args[0], function(err, result) {
    if (err) {
      log.error(err);
      return;
    }
    fs.writeFile(args[1], JSON.stringify(result), function(err) {
      if (err) {
        log.error(err);
      } else {
        log.info(result);
      }
    });
  });
}
