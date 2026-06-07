import type { Meta, StoryObj } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { ModernButton } from './ModernButton';

const meta: Meta<typeof ModernButton> = {
  title: 'UI/ModernButton',
  component: ModernButton,
  args: {
    onPress: action('onPress'),
    title: 'Button',
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline', 'ghost', 'danger', 'glass', 'gradient'],
    },
    size: {
      control: 'select',
      options: ['small', 'medium', 'large'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof ModernButton>;

export const Primary: Story = { args: { variant: 'primary', title: 'Primary' } };
export const Secondary: Story = { args: { variant: 'secondary', title: 'Secondary' } };
export const Outline: Story = { args: { variant: 'outline', title: 'Outline' } };
export const Ghost: Story = { args: { variant: 'ghost', title: 'Ghost' } };
export const Danger: Story = { args: { variant: 'danger', title: 'Delete Item' } };
export const Glass: Story = { args: { variant: 'glass', title: 'Glass' } };
export const Gradient: Story = { args: { variant: 'gradient', title: 'Gradient' } };

export const Small: Story = { args: { size: 'small', title: 'Small' } };
export const Medium: Story = { args: { size: 'medium', title: 'Medium' } };
export const Large: Story = { args: { size: 'large', title: 'Large' } };

export const Loading: Story = { args: { loading: true, title: 'Saving...' } };
export const Disabled: Story = { args: { disabled: true, title: 'Disabled' } };
export const FullWidth: Story = { args: { fullWidth: true, title: 'Full Width' } };

export const WithIconLeft: Story = {
  args: { icon: 'checkmark-circle', iconPosition: 'left', title: 'Confirm' },
};
export const WithIconRight: Story = {
  args: { icon: 'arrow-forward', iconPosition: 'right', title: 'Next' },
};
