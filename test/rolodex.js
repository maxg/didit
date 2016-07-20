const async = require('async');
const events = require('events');
const ldapjs = require('ldapjs');
const should = require('should');
const sinon = require('sinon');

describe('rolodex', function() {
  
  let config = require('../src/config');
  let rolodex = require('../src/rolodex');
  
  before(function() {
    config.ldap = true;
  });
  
  after(function() {
    config.ldap = undefined;
  });
  
  describe('lookup', function() {
    
    let search;
    
    beforeEach(function() {
      sinon.stub(ldapjs, 'createClient').returns({
        search: search = sinon.stub(),
        unbind() {}
      });
    });
    
    afterEach(function() {
      ldapjs.createClient.restore();
    });
    
    it('should perform an LDAP search', function(done) {
      let result = new events.EventEmitter();
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
          let result = new events.EventEmitter();
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
      let result = new events.EventEmitter();
      search.yields(null, result);
      rolodex.lookup('cmvest', function(err, fullname) {
        search.calledOnce.should.be.true();
        should.not.exist(fullname);
        done(err);
      });
      result.emit('end');
    });
    it('should return null on LDAP search error', function(done) {
      let result = new events.EventEmitter();
      search.yields(null, result);
      rolodex.lookup('pogo', function(err, fullname) {
        search.calledOnce.should.be.true();
        should.not.exist(fullname);
        done(err);
      });
      result.emit('error', new Error());
      result.emit('end');
    });
    it('should fail on LDAP client error', function(done) {
      search.yields(new Error());
      rolodex.lookup('Jerome Wiesner', function(err, fullname) {
        search.calledOnce.should.be.true();
        should.not.exist(fullname);
        err.should.be.an.instanceof(Error);
        done();
      });
    });
  });
});
