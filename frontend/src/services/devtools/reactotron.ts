let initialized = false;

type ReactotronClient = {
  clear?: () => void;
  configure: (options: { name: string }) => ReactotronClient;
  connect: () => void;
  useReactNative: () => ReactotronClient;
};

const isReactotronEnabled = (): boolean =>
  process.env.EXPO_PUBLIC_ENABLE_REACTOTRON === "true";

const loadReactotron = (): ReactotronClient | null => {
  if (!isReactotronEnabled()) {
    return null;
  }

  try {
    // Reactotron is an optional dev-only dependency, so keep the load dynamic.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, import/no-extraneous-dependencies, import/no-unresolved
    const loaded = require("reactotron-react-native") as unknown;

    if (loaded && typeof loaded === "object" && "default" in loaded) {
      return (loaded as { default?: ReactotronClient }).default ?? null;
    }

    return loaded as ReactotronClient;
  } catch (error) {
    console.warn("Reactotron package not available, skipping initialization", error);
    return null;
  }
};

export const initReactotron = async (): Promise<void> => {
  if (!__DEV__ || initialized) return;

  const Reactotron = loadReactotron();
  if (!Reactotron) {
    return;
  }

  Reactotron.configure({ name: "Stock Final" })
    .useReactNative()
    .connect();

  if (typeof Reactotron.clear === "function") {
    Reactotron.clear();
  }

  initialized = true;
  console.log("Reactotron initialized");
};
