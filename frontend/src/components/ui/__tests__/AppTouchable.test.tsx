import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AppTouchable } from '../AppTouchable';
import { haptics } from '@/services/haptics';

jest.mock('@/services/haptics', () => ({
  haptics: {
    light: jest.fn(),
  },
}));

describe('AppTouchable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('triggers haptics on press when onPress is provided', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <AppTouchable onPress={onPress} accessibilityLabel="Test Button" />
    );

    fireEvent.press(getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(haptics.light).toHaveBeenCalledTimes(1);
  });
});
