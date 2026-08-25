const path = require('path');
const reactNativeRoot = path.dirname(require.resolve('react-native'));

module.exports = {
  haste: { defaultPlatform: 'ios', platforms: ['android', 'ios', 'native'] },
  resolver: require.resolve('@react-native/jest-preset/jest/resolver.js'),
  transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
  testEnvironment: require.resolve('@react-native/jest-preset/jest/react-native-env.js'),
  // RN 0.87 is ESM/Flow-based and pnpm stores it behind a nested node_modules path.
  transformIgnorePatterns: [],
  setupFiles: [require.resolve('@react-native/jest-preset/jest/setup.js'), '<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
    '^react-native/setup-env$': `${reactNativeRoot}/src/setup-env.js`,
    '^react-native($|/.*)': `${reactNativeRoot}/$1`,
    '^react$': '<rootDir>/node_modules/react',
    '^react/jsx-runtime$': '<rootDir>/node_modules/react/jsx-runtime',
  },
};
