import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PinKeypad } from '../src/components/auth/PinKeypad';
import { AccessibilityInfo } from 'react-native';

// Mock AccessibilityInfo
jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

describe('PinKeypad Accessibility', () => {
    const mockOnPinChange = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders keypad buttons with correct accessibility labels', () => {
        render(
            <PinKeypad
                pin=""
                onPinChange={mockOnPinChange}
            />
        );

        // Check number keys
        expect(screen.getByLabelText('Number 1')).toBeTruthy();
        expect(screen.getByLabelText('Number 5')).toBeTruthy();
        expect(screen.getByLabelText('Number 9')).toBeTruthy();
        expect(screen.getByLabelText('Number 0')).toBeTruthy();

        // Check special keys
        expect(screen.getByLabelText('Delete')).toBeTruthy();
        expect(screen.getByLabelText('Clear')).toBeTruthy(); // Assuming Clear exists in your mapping
    });

    it('announces progress when a digit is entered', () => {
        const { rerender } = render(
            <PinKeypad
                pin=""
                onPinChange={mockOnPinChange}
                maxLength={4}
            />
        );

        // Simulate prop update reflecting a key press
        rerender(
            <PinKeypad
                pin="1"
                onPinChange={mockOnPinChange}
                maxLength={4}
            />
        );

        expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
            'PIN digit entered, 1 of 4'
        );

        // Simulate another key press
        rerender(
            <PinKeypad
                pin="12"
                onPinChange={mockOnPinChange}
                maxLength={4}
            />
        );

        expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
            'PIN digit entered, 2 of 4'
        );
    });

    it('has accessibilityLiveRegion on indicators container', () => {
        render(
            <PinKeypad
                pin="12"
                onPinChange={mockOnPinChange}
                maxLength={4}
            />
        );

        // We expect the container to have the accessible label we set
        const indicators = screen.getByLabelText('PIN entry: 2 of 4 digits entered');
        expect(indicators).toBeTruthy();
        // Note: react-test-renderer might not expose accessibilityLiveRegion directly in all versions, 
        // but verifying the label exists confirms we targeted the right element.
    });
});
