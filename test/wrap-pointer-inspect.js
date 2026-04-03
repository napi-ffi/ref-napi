'use strict';
const assert = require('assert');
const ref = require('../');
const { inspect } = require('util');

// Regression test for https://github.com/napi-ffi/node-ffi-napi/issues/4
//
// WrapPointer(non_null_ptr, 0) creates a synthetic 1-byte Buffer due to an
// N-API limitation: napi_get_typedarray_info may return NULL for the data of
// 0-length TypedArrays. To preserve the pointer value, length is forced to 1.
// However, the single backing byte at certain addresses (e.g. sentinel values
// like RTLD_NEXT = (void*)-1 = 0xffffffffffffffff) is not readable memory.
// util.inspect must not attempt to read it or the process crashes with SIGSEGV.
//
// The fix: WrapPointer marks such buffers with kPointerOnly = Symbol.for(
// 'nodejs.ref-napi.pointer_only'), and refinspect skips reading bytes for them.

describe('WrapPointer pointer-only buffers (length=0, non-NULL)', function () {
  // ref.reinterpret(buf, 0) calls the internal WrapPointer(ptr, 0) with a
  // non-NULL ptr, which is the exact code path that triggers the kPointerOnly mark.
  let pointerOnlyBuf;
  const backing = Buffer.alloc(8, 0xab);

  before(function () {
    pointerOnlyBuf = ref.reinterpret(backing, 0);
  });

  it('exports the kPointerOnly symbol correctly', function () {
    assert.strictEqual(ref.kPointerOnly, Symbol.for('nodejs.ref-napi.pointer_only'));
  });

  it('WrapPointer(ptr, 0) sets kPointerOnly on the returned buffer', function () {
    assert.strictEqual(pointerOnlyBuf[ref.kPointerOnly], true);
  });

  it('WrapPointer(ptr, 0) returns a length-1 buffer (N-API workaround)', function () {
    assert.strictEqual(pointerOnlyBuf.length, 1);
  });

  it('WrapPointer(ptr, 0) preserves the original pointer address', function () {
    assert.strictEqual(ref.address(pointerOnlyBuf), ref.address(backing));
  });

  it('util.inspect on a pointer-only buffer must not crash', function () {
    const result = inspect(pointerOnlyBuf);
    assert.strictEqual(typeof result, 'string');
  });

  it('util.inspect on a pointer-only buffer shows the address', function () {
    const result = inspect(pointerOnlyBuf);
    assert.ok(result.includes(pointerOnlyBuf.hexAddress()),
      `Expected address ${pointerOnlyBuf.hexAddress()} in: ${result}`);
  });

  it('util.inspect on a pointer-only buffer does not show raw bytes', function () {
    // refinspect should return the short <Buffer@0x...> form, not the byte-dump form
    const result = inspect(pointerOnlyBuf);
    // A byte-dump form would look like "<Buffer@0x... ab>" — we must not see the byte
    assert.ok(!/ [0-9a-f]{2}/.test(result),
      `Unexpected raw byte in inspect output: ${result}`);
  });

  it('NULL buffer does not get kPointerOnly (it is zero-length, not pointer-only)', function () {
    assert.strictEqual(ref.NULL[ref.kPointerOnly], undefined);
    assert.strictEqual(ref.NULL.length, 0);
  });

  it('WrapPointer(ptr, length>0) does not set kPointerOnly', function () {
    const explicit = ref.reinterpret(backing, 4);
    assert.strictEqual(explicit.length, 4);
    assert.strictEqual(explicit[ref.kPointerOnly], undefined);
    const result = inspect(explicit);
    // A real 4-byte buffer shows its bytes
    assert.ok(result.includes('ab'), `Expected byte content in: ${result}`);
  });
});
