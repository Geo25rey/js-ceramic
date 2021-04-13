import { HandlersMap } from '../handlers-map';
import { Doctype, DoctypeHandler, LoggerProvider } from '@ceramicnetwork/common';
import { TileDoctypeHandler } from '@ceramicnetwork/doctype-tile-handler';
import { Caip10LinkDoctypeHandler } from '@ceramicnetwork/doctype-caip10-link-handler';

const loggerProvider = new LoggerProvider();
const logger = loggerProvider.getDiagnosticsLogger();

describe('constructor', () => {
  test('default handlers', () => {
    const handlers = new HandlersMap(logger);
    expect(handlers.get('tile')).toBeInstanceOf(TileDoctypeHandler);
    expect(handlers.get('caip10-link')).toBeInstanceOf(Caip10LinkDoctypeHandler);
  });
  test('custom handlers', () => {
    const customHandler = (jest.fn() as unknown) as DoctypeHandler<Doctype>;
    const handlers = new HandlersMap(logger, new Map().set(13, customHandler));
    expect(handlers.get(13)).toBe(customHandler);
  });
});

test('set and get', () => {
  const customHandler = ({ name: 'custom', type: 13 } as unknown) as DoctypeHandler<Doctype>;
  const handlers = new HandlersMap(logger);
  expect(() => handlers.get('custom')).toThrow();
  handlers.add(customHandler);
  expect(() => handlers.get('custom')).toThrow();
  expect(handlers.get(13)).toBe(customHandler);
});

test('get non-existing', () => {
  const handlers = new HandlersMap(logger);
  expect(() => handlers.get('custom')).toThrow();
});
