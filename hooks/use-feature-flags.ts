import { useEffect, useState } from 'react';
import { useAuth } from './use-auth';

export function useFeatureFlag(featureName: string) {
  const { user } = useAuth();
  const [isEnabled, setIsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const checkFeature = async () => {
      try {
        const res = await fetch(`/api/features/check?name=${featureName}`);
        const data = await res.json();
        setIsEnabled(data.enabled);
      } catch (error) {
        console.error('[v0] Error checking feature flag:', error);
        setIsEnabled(false);
      } finally {
        setLoading(false);
      }
    };

    checkFeature();
  }, [user, featureName]);

  return { isEnabled, loading };
}

export function useFeatureFlags(featureNames: string[]) {
  const { user } = useAuth();
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || featureNames.length === 0) {
      setLoading(false);
      return;
    }

    const checkFeatures = async () => {
      try {
        const res = await fetch(`/api/features/check-multiple?names=${featureNames.join(',')}`);
        const data = await res.json();
        setFlags(data.flags);
      } catch (error) {
        console.error('[v0] Error checking feature flags:', error);
      } finally {
        setLoading(false);
      }
    };

    checkFeatures();
  }, [user, featureNames.join(',')]);

  return { flags, loading };
}
