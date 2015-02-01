describe('util', function() {
  
  var util = require('../util');
  
  describe('equalityModulo', function() {
    it('should require equality of given keys', function() {
      var eq = util.equalityModulo('a', 'b');
      eq({ a: 1, b: 2 }, { a: 1, b: 2 }).should.be.true;
      eq({ a: 1, b: 2 }, { a: 1, b: 3 }).should.be.false;
      eq({ a: 1, b: 2 }, { b: 1, a: 2 }).should.be.false;
      eq({ a: 1, b: 2 }, { a: 1 }).should.be.false;
      eq({ }, { a: 1 }).should.be.false;
      eq({ }, { }).should.be.true;
    });
    it('should use abstract equality', function() {
      var eq = util.equalityModulo('p', 'q');
      eq({ p: 1, q: 2 }, { p: '1', q: [2] }).should.be.true;
    });
    it('should ignore other keys', function() {
      var eq = util.equalityModulo('x', 'y');
      eq({ x: 1, y: 2 }, { x: 1, y: 2, a: 3 }).should.be.true;
      eq({ x: 1, y: 2, a: 3 }, { x: 1, y: 2, a: 4 }).should.be.true;
      eq({ x: 1, y: 2, a: 3 }, { x: 1, y: 2, b: 3 }).should.be.true;
    });
  });
  
  describe('difference', function() {
    it('should compute difference', function() {
      var eq = function(a, b) { return a == b; }
      util.difference(eq, [ 1, 2, 3, 4 ], [ 2, 4 ]).should.eql([ 1, 3 ]);
      util.difference(eq, [ 1, 2, 3, 4 ], []).should.eql([ 1, 2, 3, 4 ]);
      util.difference(eq, [], [ 2, 4 ]).should.eql([]);
    });
    it('should use given equality operator', function() {
      var eq = function(a, b) { return a.x == b.x; }
      util.difference(eq, [
        { x: 1, y: 0 }, { x: 1, y: 42 }, { x: 2, y: 0 }, { x: 2, y: 42 }
      ], [
        { x: 1 }, { y: 0 }
      ]).should.eql([ { x: 2, y: 0 }, { x: 2, y: 42 } ]);
    });
  });
});
