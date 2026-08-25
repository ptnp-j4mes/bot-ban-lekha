/* global jest */

global.__DEV__ = true;

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props) => React.createElement(View, props);
  return new Proxy({}, { get: () => Icon });
});
