import React from "react";
import { Platform } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import { OperationalCommandBar } from "../OperationalCommandBar";

describe("OperationalCommandBar", () => {
  const originalPlatformOS = Platform.OS;

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: originalPlatformOS,
    });
  });

  it("renders operational commands and triggers actions", () => {
    const acceptServer = jest.fn();
    const acceptLocal = jest.fn();

    const { getByLabelText, getByText } = render(
      <OperationalCommandBar
        title="Resolution command"
        subtitle="Choose the source of truth for this conflict."
        actions={[
          {
            label: "Accept Server",
            icon: "cloud-done-outline",
            tone: "success",
            shortcut: "S",
            onPress: acceptServer,
            accessibilityHint: "Resolves using server data",
          },
          {
            label: "Accept Local",
            icon: "phone-portrait-outline",
            tone: "secondary",
            shortcut: "L",
            onPress: acceptLocal,
            accessibilityHint: "Resolves using local data",
          },
        ]}
      />
    );

    expect(getByText("Resolution command")).toBeTruthy();
    expect(getByText("Accept Server")).toBeTruthy();
    expect(getByText("Accept Local")).toBeTruthy();
    expect(getByText("S")).toBeTruthy();
    expect(getByText("L")).toBeTruthy();

    fireEvent.press(getByLabelText("Accept Server. Shortcut S"));
    fireEvent.press(getByLabelText("Accept Local. Shortcut L"));

    expect(acceptServer).toHaveBeenCalledTimes(1);
    expect(acceptLocal).toHaveBeenCalledTimes(1);
  });

  it("does not trigger disabled or busy commands", () => {
    const disabledAction = jest.fn();
    const busyAction = jest.fn();

    const { getByLabelText } = render(
      <OperationalCommandBar
        actions={[
          {
            label: "Disabled",
            disabled: true,
            onPress: disabledAction,
          },
          {
            label: "Busy",
            busy: true,
            onPress: busyAction,
          },
        ]}
      />
    );

    fireEvent.press(getByLabelText("Disabled"));
    fireEvent.press(getByLabelText("Busy"));

    expect(disabledAction).not.toHaveBeenCalled();
    expect(busyAction).not.toHaveBeenCalled();
  });

  it("runs web keyboard shortcuts outside editable fields", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });

    const acceptServer = jest.fn();
    const preventDefault = jest.fn();
    let keydownHandler: ((event: any) => void) | undefined;

    const addEventListener = jest
      .spyOn(globalThis, "addEventListener")
      .mockImplementation((eventName, handler) => {
        if (eventName === "keydown") {
          keydownHandler = handler as (event: any) => void;
        }
      });
    const removeEventListener = jest
      .spyOn(globalThis, "removeEventListener")
      .mockImplementation(() => undefined);

    const { unmount } = render(
      <OperationalCommandBar
        actions={[
          {
            label: "Accept Server",
            shortcut: "S",
            onPress: acceptServer,
          },
        ]}
      />
    );

    expect(addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));

    keydownHandler?.({
      key: "s",
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      preventDefault,
      target: { tagName: "body" },
    });
    expect(acceptServer).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);

    keydownHandler?.({
      key: "s",
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      preventDefault,
      target: { tagName: "input" },
    });
    expect(acceptServer).toHaveBeenCalledTimes(1);

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("supports mod-key operational shortcuts", () => {
    Object.defineProperty(Platform, "OS", {
      configurable: true,
      value: "web",
    });

    const retry = jest.fn();
    let keydownHandler: ((event: any) => void) | undefined;

    jest.spyOn(globalThis, "addEventListener").mockImplementation((eventName, handler) => {
      if (eventName === "keydown") {
        keydownHandler = handler as (event: any) => void;
      }
    });
    jest.spyOn(globalThis, "removeEventListener").mockImplementation(() => undefined);

    render(
      <OperationalCommandBar
        actions={[
          {
            label: "Retry",
            shortcut: "Mod+R",
            onPress: retry,
          },
        ]}
      />
    );

    keydownHandler?.({
      key: "r",
      shiftKey: false,
      ctrlKey: true,
      altKey: false,
      metaKey: false,
      preventDefault: jest.fn(),
      target: { tagName: "body" },
    });

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
