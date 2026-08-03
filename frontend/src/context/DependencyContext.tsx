import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform } from 'react-native';

interface Dependencies {
  storage: any;
  syncEngine: any;
  scanner: any;
}

interface DependencyContextType {
  container: { dependencies: Dependencies } | null;
  loading: boolean;
  error: string | null;
}

const DependencyContext = createContext<DependencyContextType>({
  container: null,
  loading: true,
  error: null,
});

interface DependencyProviderProps {
  children: ReactNode;
}

export const DependencyProvider: React.FC<DependencyProviderProps> = ({ children }) => {
  const [container, setContainer] = useState<{ dependencies: Dependencies } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeContainer = async () => {
      try {
        let selectedContainer: { dependencies: Dependencies };
        
        if (Platform.OS === 'web') {
          const { container: webContainer } = await import('../../apps/web-admin/src/di/container');
          selectedContainer = webContainer;
        } else {
          const { container: mobileContainer } = await import('../../apps/mobile/src/di/container');
          selectedContainer = mobileContainer;
        }
        
        setContainer(selectedContainer);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize dependency container');
        setLoading(false);
      }
    };

    initializeContainer();
  }, []);

  return (
    <DependencyContext.Provider value={{ container, loading, error }}>
      {children}
    </DependencyContext.Provider>
  );
};

export const useDependencyContainer = () => {
  const context = useContext(DependencyContext);
  if (!context) {
    throw new Error('useDependencyContainer must be used within a DependencyProvider');
  }
  return context;
};