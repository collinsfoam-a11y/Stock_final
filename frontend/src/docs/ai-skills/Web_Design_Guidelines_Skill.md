# Web Design Guidelines Skill

## Overview
This skill provides comprehensive web design guidelines to ensure consistent, accessible, and user-friendly interfaces across all applications.

## Core Principles

### 1. Accessibility First
- All designs must meet WCAG 2.1 AA standards
- Color contrast ratios must be at least 4.5:1 for normal text
- All interactive elements must have a minimum 44px touch target
- Keyboard navigation must be fully supported
- Screen reader compatibility is mandatory

### 2. Responsive Design
- Mobile-first approach for all layouts
- Flexible grids and media queries for all screen sizes
- Touch-friendly interactions for mobile devices
- Progressive enhancement for older browsers
- Fast loading times across all connection speeds

### 3. Visual Hierarchy
- Clear information architecture with logical content flow
- Consistent typography scale (heading, subheading, body, caption)
- Strategic use of whitespace for content separation
- Visual cues for interactive elements
- Consistent spacing and alignment

### 4. Performance Optimization
- Minimize HTTP requests and optimize asset sizes
- Implement lazy loading for non-critical resources
- Use efficient CSS selectors and minimize repaint/reflows
- Optimize images with appropriate formats and compression
- Implement caching strategies where appropriate

## Design System Elements

### Color Palette
- Primary: Brand blue (#007AFF)
- Secondary: Support color (#5856D6)
- Success: Green (#34C759)
- Warning: Orange (#FF9500)
- Danger: Red (#FF3B30)
- Background: Light gray (#F2F2F7)
- Surface: White (#FFFFFF)
- Text: Dark gray (#1C1C1E)
- Secondary text: Medium gray (#8E8E93)

### Typography
- Primary font: System font stack (San Francisco on iOS, Roboto on Android)
- Heading 1: 34px, Bold
- Heading 2: 28px, Bold
- Heading 3: 22px, Semibold
- Body: 17px, Regular
- Caption: 12px, Regular

### Spacing System
- Base unit: 4px
- 1 unit: 4px
- 2 units: 8px
- 3 units: 12px
- 4 units: 16px
- 6 units: 24px
- 8 units: 32px
- 12 units: 48px
- 16 units: 64px

### Component Guidelines

#### Buttons
- Primary: Solid background with brand color
- Secondary: Outline with brand color
- Size options: Small (44px height), Medium (48px), Large (52px)
- Border radius: 8px
- Minimum touch target: 44px

#### Input Fields
- Height: 44px minimum
- Border: 1px solid secondary text color
- Border radius: 8px
- Padding: 12px
- Focus state: Brand color border

#### Cards
- Background: White or light surface
- Border radius: 12px
- Shadow: Subtle elevation effect
- Padding: 16px

## Validation Checklist

### Before Implementation
- [ ] All colors meet contrast requirements
- [ ] Touch targets are at least 44px
- [ ] Keyboard navigation is supported
- [ ] Screen reader compatibility is tested
- [ ] Responsive behavior is verified on all screen sizes
- [ ] Performance impact is minimized
- [ ] Cross-browser compatibility is ensured

### During Development
- [ ] Use semantic HTML elements
- [ ] Implement proper ARIA attributes
- [ ] Follow logical tab order
- [ ] Maintain consistent design language
- [ ] Optimize for performance

### After Completion
- [ ] Accessibility testing with tools like axe
- [ ] Cross-browser testing
- [ ] Performance testing
- [ ] User testing feedback
- [ ] Design consistency verification

## Common Pitfalls to Avoid

### Accessibility Issues
- Insufficient color contrast
- Missing alternative text for images
- Non-descriptive link text
- Incorrect heading hierarchy
- Missing focus indicators

### Performance Issues
- Large image files
- Unoptimized JavaScript
- Excessive HTTP requests
- Blocking CSS/JavaScript
- Memory leaks

### Usability Issues
- Inconsistent design patterns
- Unclear navigation
- Hidden interactive elements
- Complex user flows
- Unclear error messages

## Best Practices

### For Developers
- Use CSS custom properties for theming
- Implement component-based architecture
- Use CSS containment for performance
- Implement proper error boundaries
- Follow semantic versioning for components

### For Designers
- Create consistent design tokens
- Maintain component libraries
- Document design decisions
- Consider internationalization
- Plan for accessibility from the start

This skill ensures that all web designs follow consistent, accessible, and performant guidelines that enhance user experience across all platforms and devices.