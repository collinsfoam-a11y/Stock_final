## 2024-05-18 - Extracted React Subcomponents out of Render body
**Learning:** In React Native, avoid defining functional components (e.g. `RenderItem`) inside the render body of a parent component. This React anti-pattern breaks memoization, causes the inner component to unmount and remount on every parent render, and destroys local state.
**Action:** Always extract such sub-components to the module or file level and pass required dependencies as props.
