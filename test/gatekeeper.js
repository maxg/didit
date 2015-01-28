var async = require('async');
var fs = require('fs');
var should = require('should');
var sinon = require('sinon');

var fixtures = require('./fixtures');

describe('gatekeeper', function() {
  
  var gatekeeper = require('../gatekeeper');
  
  var fix = fixtures();
  var tickets = [
    { kind: 'inclass', proj: 'ic1-hello', users: [ 'hyperion' ] },
    { kind: 'inclass', proj: 'ic1-hello', users: [ 'theia' ] },
    { kind: 'inclass', proj: 'ic2-goodbye', users: [ 'atlas', 'prometheus' ] },
  ];
  var sandbox = sinon.sandbox.create();
  
  before(function(done) {
    fix.files(this.test, done);
  });
  
  afterEach(function() {
    sandbox.restore();
  });
  
  describe('findTickets', function() {
    it('should return repository specifications', function(done) {
      gatekeeper.findTickets({}, function(err, specs) {
        specs.should.eql(tickets);
        done(err);
      });
    });
    it('kind restriction should limit tickets', function(done) {
      gatekeeper.findTickets({ kind: 'labs' }, function(err, specs) {
        specs.should.eql([]);
        done(err);
      });
    });
    it('proj restriction should limit tickets', function(done) {
      gatekeeper.findTickets({ proj: 'ic1-hello' }, function(err, specs) {
        specs.should.eql(tickets.slice(0, 2));
        done(err);
      });
    });
    it('user restriction should limit tickets', function(done) {
      gatekeeper.findTickets({ users: [ 'atlas' ] }, function(err, specs) {
        specs.should.eql(tickets.slice(2, 3));
        done(err);
      });
    });
    it('should fail with filesystem error', function(done) {
      sandbox.stub(fs, 'readdir').yields(new Error());
      sandbox.stub(console, 'error');
      gatekeeper.findTickets({ kind: 'inclass' }, function(err, specs) {
        should.exist(err);
        done();
      });
    });
  });
  
  describe('createTickets', function() {
    it('should create new tickets', function(done) {
      var usernames = [
        [ 'eos' ],
        [ 'helios', 'selene' ],
      ];
      gatekeeper.createTickets({ kind: 'inclass', proj: 'ic3-world' }, usernames, function(err) {
        gatekeeper.findTickets({}, function(finderr, specs) {
          usernames.forEach(function(users) {
            specs.should.includeEql({
              kind: 'inclass', proj: 'ic3-world', users: users
            });
          });
          done(err || finderr);
        });
      });
    });
    it('should fail with invalid username', function(done) {
      async.each([ ' ', '.', 'te/st', '$test' ], function(username, next) {
        gatekeeper.createTickets({ kind: 'inclass', proj: 'ic4-invalid' }, [ [ username ] ], function(err) {
          should.exist(err);
          next();
        });
      }, function() {
        gatekeeper.findTickets({}, function(err, specs) {
          specs.forEach(function(spec) {
            spec.should.not.include({ proj: 'ic4-invalid' });
          });
          done(err);
        });
      });
    });
  });
  
  describe('isProjectReleased', function() {
    it('should return true for released project', function(done) {
      gatekeeper.isProjectReleased({ kind: 'inclass', proj: 'ic1-hello' }, function(err, released) {
        released.should.be.true;
        done(err);
      });
    });
    it('should return false for released project', function(done) {
      gatekeeper.isProjectReleased({ kind: 'inclass', proj: 'ic2-goodbye' }, function(err, released) {
        released.should.be.false;
        done(err);
      });
    });
  });
  
  describe('findReleasedProjects', function() {
    it('should return project specifications', function(done) {
      gatekeeper.findReleasedProjects({}, function(err, specs) {
        specs.should.eql([ { kind: 'inclass', proj: 'ic1-hello' } ]);
        done(err);
      });
    });
    it('kind restriction should limit projects', function(done) {
      gatekeeper.findReleasedProjects({ kind: 'labs' }, function(err, specs) {
        specs.should.eql([]);
        done(err);
      });
    });
    it('proj restriction should limit projects', function(done) {
      gatekeeper.findReleasedProjects({ proj: 'ic2-goodbye' }, function(err, specs) {
        specs.should.eql([]);
        done(err);
      });
    });
  });
  
  describe('releaseProject', function() {
    it('should release a project', function(done) {
      var spec = { kind: 'inclass', proj: 'ic3-world' };
      async.auto({
        pre: async.apply(gatekeeper.isProjectReleased, spec),
        release: [ 'pre', async.apply(gatekeeper.releaseProject, spec) ],
        post: [ 'release', async.apply(gatekeeper.isProjectReleased, spec) ]
      }, function(err, results) {
        results.pre.should.be.false;
        results.post.should.be.true;
        done(err);
      });
    });
  });
});
