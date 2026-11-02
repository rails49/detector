// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vitest';
import { clearNote, noteStep, takeNote } from '../src/trace.js';

beforeEach(() => localStorage.clear());

it('reports the last step of a run that did not finish, once', () => {
  noteStep('webgpu fp32, 2 tiles of 2048', 'loading model');
  noteStep('webgpu fp32, 2 tiles of 2048', 'first frame');
  expect(takeNote()).toBe('webgpu fp32, 2 tiles of 2048: stopped at first frame');
  expect(takeNote()).toBeUndefined();
});

it('reports nothing after a run that ended', () => {
  noteStep('wasm fp32, 1 tiles of 1024', 'frame 3');
  clearNote();
  expect(takeNote()).toBeUndefined();
});
