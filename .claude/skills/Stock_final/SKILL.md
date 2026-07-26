```markdown
# Stock_final Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the development patterns and conventions used in the `Stock_final` repository, a TypeScript-based codebase without a detected framework. You will learn about file naming, import/export styles, commit patterns, and how to write and run tests. This guide also provides suggested commands for common workflows.

## Coding Conventions

### File Naming
- Files are named using **PascalCase**.
  - **Example:**  
    ```
    StockManager.ts
    UserProfile.ts
    ```

### Import Style
- **Relative imports** are used throughout the codebase.
  - **Example:**  
    ```typescript
    import { StockService } from './StockService';
    ```

### Export Style
- Both **default** and **named exports** are used.
  - **Default Export Example:**  
    ```typescript
    export default class StockManager { ... }
    ```
  - **Named Export Example:**  
    ```typescript
    export function calculateStockValue(...) { ... }
    ```

### Commit Patterns
- Commit messages are **freeform** (no enforced prefixes or structure).
- Average commit message length: **76 characters**.

  - **Example:**  
    ```
    Fix bug in stock calculation for negative values
    ```

## Workflows

### Adding a New Feature
**Trigger:** When you need to implement new functionality.
**Command:** `/add-feature`

1. Create a new file using PascalCase (e.g., `NewFeature.ts`).
2. Write your TypeScript code, using relative imports for dependencies.
3. Export your main class or function (default or named as appropriate).
4. Write corresponding tests in a `.test.ts` file.
5. Commit your changes with a clear, descriptive message.

### Fixing a Bug
**Trigger:** When you discover and need to fix a bug.
**Command:** `/fix-bug`

1. Identify the file(s) containing the bug.
2. Make the necessary code changes.
3. Update or add tests in the relevant `.test.ts` file to cover the fix.
4. Commit your changes with a message describing the bug and fix.

### Running Tests
**Trigger:** To verify code correctness after changes.
**Command:** `/run-tests`

1. Locate all `*.test.*` files.
2. Run the tests using your preferred TypeScript-compatible test runner.
   - (Note: The specific test framework is not detected; use your project's chosen tool.)

## Testing Patterns

- Test files follow the pattern: `*.test.*` (e.g., `StockService.test.ts`).
- The testing framework is **unknown**; ensure you use the correct runner for your environment.
- Place tests alongside or near the code they test, using relative imports if necessary.

  - **Example:**  
    ```typescript
    // StockService.test.ts
    import { calculateStockValue } from './StockService';

    test('calculates correct stock value', () => {
      expect(calculateStockValue(10, 5)).toBe(50);
    });
    ```

## Commands
| Command        | Purpose                                      |
|----------------|----------------------------------------------|
| /add-feature   | Start workflow for adding a new feature      |
| /fix-bug       | Start workflow for fixing a bug              |
| /run-tests     | Run all test files in the repository         |
```
