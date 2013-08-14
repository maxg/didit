var async = require('async');
var fs = require('fs');
var ncp = require('ncp');
var path = require('path');
var temp = require('temp');

module.exports = function() {
  return new Fixture();
};

function Fixture() {
  this.fixdir = undefined;
}

Fixture.prototype.files = function(test, callback) {
  var srcdir = fixturePath(testTitle(test));
  this.mktemp();
  fs.readdir(srcdir, (function(err, files) {
    if (err) { return callback(); }
    async.eachSeries(files, (function(file, next) {
      ncp(path.join(srcdir, file), path.join(this.fixdir, file), next);
    }).bind(this), callback);
  }).bind(this));
};

Fixture.prototype.mktemp = function() {
  if ( ! this.fixdir) {
    this.fixdir = temp.mkdirSync('test-');
  }
};

Fixture.prototype.readFile = function(filename, callback) {
  fs.readFile(path.join(this.fixdir, filename), { encoding: 'utf8' }, callback);
};

Fixture.prototype.forget = function() {
  this.fixdir = undefined;
};

function testTitle(test) {
  if ( ! test.title) { return []; }
  return testTitle(test.parent).concat([ test.title ]);
}

function fixturePath(titles) {
  titles = titles.map(function(title) {
    return title.replace(/([a-z])([A-Z]+)|\s+/g, '$1-$2').toLowerCase().replace(/[^\w-]/g, '');
  });
  return path.join.apply(path, [ __dirname, 'fixtures' ].concat(titles));
}
