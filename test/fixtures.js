const async = require('async');
const fs = require('fs');
const fsextra = require('fs-extra');
const path = require('path');
const temp = require('temp').track();

const config = require('../src/config');

module.exports = function() {
  return new Fixture();
};

function Fixture() {
  this.fixdir = undefined;
}

Fixture.prototype.files = function(test, callback) {
  let srcdir = fixturePath(testTitle(test));
  this.mktemp();
  fs.readdir(srcdir, (err, files) => {
    if (err) { return callback(); }
    async.eachSeries(files, (file, next) => {
      if (this.special[file]) {
        recursiveCopier(this.special[file])(path.join(srcdir, file), next);
      } else {
        fsextra.copy(path.join(srcdir, file), path.join(this.fixdir, file), next);
      }
    }, callback);
  });
};

Fixture.prototype.filesTo = function(test, source, destination, callback) {
  recursiveCopier(destination)(path.join(fixturePath(testTitle(test)), source), callback);
};

Fixture.prototype.special = {
  'student-repos': path.join(config.student.repos, config.student.semester),
  'staff-repo.git': config.staff.repo,
  'build-results': path.join(config.build.results, config.student.semester),
  'sweeps': path.join(config.build.results, 'sweeps', config.student.semester),
  'milestones': path.join(config.build.results, 'milestones', config.student.semester),
  'tickets': path.join(config.build.results, 'tickets', config.student.semester),
};

function recursiveCopier(destination) {
  return function(dirname, callback) {
    async.waterfall([
      async.apply(fsextra.mkdirs, destination),
      function(_, next) { fs.readdir(dirname, next); },
      function(files, done) {
        async.each(files, function(file, next) {
          fsextra.copy(path.join(dirname, file), path.join(destination, file), next);
        }, done);
      }
    ], callback);
  };
}

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

Fixture.prototype.remove = function(callback) {
  let special = this.special;
  async.parallel(Object.keys(special).map(function(name) {
    return async.apply(fsextra.remove, special[name]);
  }), callback);
};

function testTitle(test) {
  if ( ! test.title) { return []; }
  return testTitle(test.parent).concat([ test.title ]);
}

function fixturePath(titles) {
  titles = titles.map(function(title) {
    return title.replace(/([a-z])([A-Z]+)|[\s\/]+/g, '$1-$2').toLowerCase().replace(/[^\w-]/g, '');
  });
  return path.join.apply(path, [ __dirname, 'fixtures' ].concat(titles));
}
