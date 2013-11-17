var async = require('async');
var events = require('events');
var ldapjs = require('ldapjs');
var should = require('should');
var sinon = require('sinon');

describe('rolodex', function() {
  
  var config = require('../config');
  var rolodex = require('../rolodex');
  
  before(function() {
    config.ldap = true;
  });
  
  after(function() {
    config.ldap = undefined;
  });
  
  describe('lookup', function() {
    
    var search;
    
    beforeEach(function() {
      sinon.stub(ldapjs, 'createClient').returns({
        search: search = sinon.stub(),
        unbind: function() {}
      });
    });
    
    afterEach(function() {
      ldapjs.createClient.restore();
    });
    
    it('should perform an LDAP search', function(done) {
      var result = new events.EventEmitter();
      search.yields(null, result);
      rolodex.lookup('reif', function(err, fullname) {
        fullname.should.equal('Rafael Reif');
        done(err);
      });
      result.emit('searchEntry', { object: { givenName: 'Rafael', surname: 'Reif' } });
      result.emit('end');
    });
    it('should not repeat LDAP searches', function(done) {
      async.series([
        function(next) {
          var result = new events.EventEmitter();
          search.yields(null, result);
          rolodex.lookup('hockfield', next);
          result.emit('searchEntry', { object: { givenName: 'Susan', surname: 'Hockfield' } });
          result.emit('end');
        },
        function(next) {
          search.throws('expected cache hit');
          rolodex.lookup('hockfield', next);
        }
      ], function(err, results) {
        results.should.eql([ 'Susan Hockfield', 'Susan Hockfield' ]);
        done(err);
      });
    });
    it('should return null on unknown user', function(done) {
      var result = new events.EventEmitter();
      search.yields(null, result);
      rolodex.lookup('cmvest', function(err, fullname) {
        search.calledOnce.should.be.true;
        should.not.exist(fullname);
        done(err);
      });
      result.emit('end');
    });
    it('should return null on LDAP search error', function(done) {
      var result = new events.EventEmitter();
      search.yields(null, result);
      rolodex.lookup('pogo', function(err, fullname) {
        search.calledOnce.should.be.true;
        should.not.exist(fullname);
        done(err);
      });
      result.emit('error', new Error());
      result.emit('end');
    });
    it('should fail on LDAP client error', function(done) {
      search.yields(new Error());
      rolodex.lookup('Jerome Wiesner', function(err, fullname) {
        search.calledOnce.should.be.true;
        should.not.exist(fullname);
        err.should.be.an.instanceof(Error);
        done();
      });
    });
  });
});
