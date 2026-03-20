/**
 * Tests for useFormValidation hook
 */

import { describe, it, expect } from "@jest/globals";
import { renderHook, act } from "@testing-library/react-native";
import { useFormValidation } from "../useFormValidation";

describe("useFormValidation", () => {
  describe("initial state", () => {
    it("initializes values from defaultValue", () => {
      const { result } = renderHook(() =>
        useFormValidation([
          { name: "username", defaultValue: "alice" },
          { name: "password", defaultValue: "" },
        ])
      );

      expect(result.current.values.username).toBe("alice");
      expect(result.current.values.password).toBe("");
    });

    it("defaults to empty string when no defaultValue", () => {
      const { result } = renderHook(() =>
        useFormValidation([{ name: "email" }])
      );

      expect(result.current.values.email).toBe("");
    });

    it("starts with no errors", () => {
      const { result } = renderHook(() =>
        useFormValidation([{ name: "email" }])
      );

      expect(result.current.errors).toEqual({});
    });

    it("starts with no touched fields", () => {
      const { result } = renderHook(() =>
        useFormValidation([{ name: "email" }])
      );

      expect(result.current.touched).toEqual({});
    });

    it("starts with isSubmitting=false", () => {
      const { result } = renderHook(() =>
        useFormValidation([{ name: "email" }])
      );

      expect(result.current.isSubmitting).toBe(false);
    });
  });

  describe("setValue", () => {
    it("updates field value", () => {
      const { result } = renderHook(() =>
        useFormValidation([{ name: "username" }])
      );

      act(() => {
        result.current.setValue("username", "bob");
      });

      expect(result.current.values.username).toBe("bob");
    });

    it("does not automatically trigger validation", () => {
      const { result } = renderHook(() =>
        useFormValidation([
          {
            name: "username",
            rules: { required: "Username is required" },
          },
        ])
      );

      act(() => {
        result.current.setValue("username", "");
      });

      // Errors are only set after handleSubmit, not on setValue
      expect(result.current.errors.username).toBeUndefined();
    });
  });

  describe("setFieldTouched", () => {
    it("marks field as touched", () => {
      const { result } = renderHook(() =>
        useFormValidation([{ name: "email" }])
      );

      act(() => {
        result.current.setFieldTouched("email", true);
      });

      expect(result.current.touched.email).toBe(true);
    });

    it("clears touched status", () => {
      const { result } = renderHook(() =>
        useFormValidation([{ name: "email" }])
      );

      act(() => {
        result.current.setFieldTouched("email", true);
      });
      act(() => {
        result.current.setFieldTouched("email", false);
      });

      expect(result.current.touched.email).toBe(false);
    });
  });

  describe("setFieldError", () => {
    it("sets a custom error on a field", () => {
      const { result } = renderHook(() =>
        useFormValidation([{ name: "email" }])
      );

      act(() => {
        result.current.setFieldError("email", "Email already taken");
      });

      expect(result.current.errors.email).toBe("Email already taken");
    });

    it("clears field error when called without value", () => {
      const { result } = renderHook(() =>
        useFormValidation([{ name: "email" }])
      );

      act(() => {
        result.current.setFieldError("email", "Error");
      });
      act(() => {
        result.current.setFieldError("email", undefined);
      });

      expect(result.current.errors.email).toBeUndefined();
    });
  });

  describe("handleSubmit - validation rules", () => {
    it("validates required field (string rule) on submit", async () => {
      const mockCallback = jest.fn();
      const { result } = renderHook(() =>
        useFormValidation([
          {
            name: "username",
            defaultValue: "",
            rules: { required: "Username is required" },
          },
        ])
      );

      await act(async () => {
        const submit = result.current.handleSubmit(mockCallback);
        await submit();
      });

      expect(result.current.errors.username).toBe("Username is required");
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it("validates required field (object rule) on submit", async () => {
      const mockCallback = jest.fn();
      const { result } = renderHook(() =>
        useFormValidation([
          {
            name: "username",
            defaultValue: "",
            rules: { required: { message: "Required!" } },
          },
        ])
      );

      await act(async () => {
        const submit = result.current.handleSubmit(mockCallback);
        await submit();
      });

      expect(result.current.errors.username).toBe("Required!");
    });

    it("validates minLength rule on submit", async () => {
      const mockCallback = jest.fn();
      const { result } = renderHook(() =>
        useFormValidation([
          {
            name: "username",
            defaultValue: "abc",
            rules: { minLength: { value: 5, message: "Too short" } },
          },
        ])
      );

      await act(async () => {
        const submit = result.current.handleSubmit(mockCallback);
        await submit();
      });

      expect(result.current.errors.username).toBe("Too short");
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it("passes minLength when value is long enough", async () => {
      const mockCallback = jest.fn();
      const { result } = renderHook(() =>
        useFormValidation([
          {
            name: "username",
            defaultValue: "alice",
            rules: { minLength: { value: 3, message: "Too short" } },
          },
        ])
      );

      await act(async () => {
        const submit = result.current.handleSubmit(mockCallback);
        await submit();
      });

      expect(result.current.errors.username).toBeUndefined();
      expect(mockCallback).toHaveBeenCalled();
    });

    it("validates pattern rule on submit", async () => {
      const mockCallback = jest.fn();
      const { result } = renderHook(() =>
        useFormValidation([
          {
            name: "email",
            defaultValue: "not-an-email",
            rules: {
              pattern: { value: /^[^@]+@[^@]+$/, message: "Invalid email" },
            },
          },
        ])
      );

      await act(async () => {
        const submit = result.current.handleSubmit(mockCallback);
        await submit();
      });

      expect(result.current.errors.email).toBe("Invalid email");
    });

    it("passes pattern when value matches", async () => {
      const mockCallback = jest.fn();
      const { result } = renderHook(() =>
        useFormValidation([
          {
            name: "email",
            defaultValue: "user@example.com",
            rules: {
              pattern: { value: /^[^@]+@[^@]+$/, message: "Invalid email" },
            },
          },
        ])
      );

      await act(async () => {
        const submit = result.current.handleSubmit(mockCallback);
        await submit();
      });

      expect(result.current.errors.email).toBeUndefined();
    });

    it("uses custom validation rule on submit", async () => {
      const mockCallback = jest.fn();
      const { result } = renderHook(() =>
        useFormValidation([
          {
            name: "age",
            defaultValue: "16",
            rules: {
              custom: (value: any) =>
                Number(value) < 18 ? "Must be 18 or older" : null,
            },
          },
        ])
      );

      await act(async () => {
        const submit = result.current.handleSubmit(mockCallback);
        await submit();
      });

      expect(result.current.errors.age).toBe("Must be 18 or older");
    });

    it("custom rule passes for valid value", async () => {
      const mockCallback = jest.fn();
      const { result } = renderHook(() =>
        useFormValidation([
          {
            name: "age",
            defaultValue: "21",
            rules: {
              custom: (value: any) =>
                Number(value) < 18 ? "Must be 18 or older" : null,
            },
          },
        ])
      );

      await act(async () => {
        const submit = result.current.handleSubmit(mockCallback);
        await submit();
      });

      expect(result.current.errors.age).toBeUndefined();
      expect(mockCallback).toHaveBeenCalled();
    });
  });

  describe("handleSubmit - submit behavior", () => {
    it("calls callback with values when form is valid", async () => {
      const mockCallback = jest.fn();

      const { result } = renderHook(() =>
        useFormValidation([
          { name: "username", defaultValue: "alice" },
        ])
      );

      await act(async () => {
        const submit = result.current.handleSubmit(mockCallback);
        await submit();
      });

      expect(mockCallback).toHaveBeenCalledWith({ username: "alice" });
    });

    it("does not call callback when required field is empty", async () => {
      const mockCallback = jest.fn();

      const { result } = renderHook(() =>
        useFormValidation([
          {
            name: "username",
            defaultValue: "",
            rules: { required: "Username is required" },
          },
        ])
      );

      await act(async () => {
        const submit = result.current.handleSubmit(mockCallback);
        await submit();
      });

      expect(mockCallback).not.toHaveBeenCalled();
      expect(result.current.errors.username).toBeDefined();
    });

    it("resets isSubmitting after callback resolves", async () => {
      const { result } = renderHook(() =>
        useFormValidation([{ name: "username", defaultValue: "alice" }])
      );

      await act(async () => {
        const submit = result.current.handleSubmit(async () => {
          // no-op async
        });
        await submit();
      });

      expect(result.current.isSubmitting).toBe(false);
    });

    it("validates multiple fields at once on submit", async () => {
      const mockCallback = jest.fn();

      const { result } = renderHook(() =>
        useFormValidation([
          { name: "username", defaultValue: "", rules: { required: "Required" } },
          { name: "email", defaultValue: "", rules: { required: "Required" } },
        ])
      );

      await act(async () => {
        const submit = result.current.handleSubmit(mockCallback);
        await submit();
      });

      expect(result.current.errors.username).toBeDefined();
      expect(result.current.errors.email).toBeDefined();
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it("clears errors for passing fields on resubmit", async () => {
      const mockCallback = jest.fn();

      const { result } = renderHook(() =>
        useFormValidation([
          {
            name: "username",
            defaultValue: "",
            rules: { required: "Required" },
          },
        ])
      );

      // First submit - fails
      await act(async () => {
        const submit = result.current.handleSubmit(mockCallback);
        await submit();
      });
      expect(result.current.errors.username).toBeDefined();

      // Update value to pass validation
      act(() => {
        result.current.setValue("username", "alice");
      });

      // Second submit - should pass
      await act(async () => {
        const submit = result.current.handleSubmit(mockCallback);
        await submit();
      });

      expect(result.current.errors.username).toBeUndefined();
      expect(mockCallback).toHaveBeenCalled();
    });
  });
});
