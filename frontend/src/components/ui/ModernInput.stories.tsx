import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import ModernInput from './ModernInput';

const meta: Meta<typeof ModernInput> = {
  title: 'UI/ModernInput',
  component: ModernInput,
  args: {
    value: '',
    onChangeText: () => {},
    placeholder: 'Enter text...',
  },
};

export default meta;
type Story = StoryObj<typeof ModernInput>;

export const Default: Story = { args: { placeholder: 'Enter value' } };
export const WithLabel: Story = { args: { label: 'Item Code', placeholder: 'e.g. SKU-001' } };
export const WithValue: Story = { args: { label: 'Item Code', value: 'SKU-001' } };
export const WithError: Story = {
  args: { label: 'Quantity', value: '-1', error: 'Quantity must be greater than zero' },
};
export const Disabled: Story = { args: { label: 'Location', value: 'Rack A-12', disabled: true } };
export const Password: Story = {
  args: { label: 'PIN', placeholder: '••••', secureTextEntry: true },
};
export const WithIcon: Story = {
  args: { label: 'Search', placeholder: 'Search items...', icon: 'search' },
};
