'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit2, Trash2, Settings } from 'lucide-react';

export default function PricingAdminPage() {
  const [selectedTier, setSelectedTier] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Fetch pricing tiers
  const { data: tiers, mutate: mutateTiers } = useSWR('/api/admin/pricing/tiers', async (url) => {
    const res = await fetch(url);
    return res.json();
  });

  // Fetch features
  const { data: features, mutate: mutateFeatures } = useSWR('/api/admin/pricing/features', async (url) => {
    const res = await fetch(url);
    return res.json();
  });

  // Fetch tier features
  const { data: tierFeatures } = useSWR(
    selectedTier ? `/api/admin/pricing/tiers/${selectedTier.id}/features` : null,
    async (url) => {
      const res = await fetch(url);
      return res.json();
    }
  );

  const handleCreateTier = async (data) => {
    try {
      const res = await fetch('/api/admin/pricing/tiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await mutateTiers();
        setIsDialogOpen(false);
      }
    } catch (error) {
      console.error('[v0] Error creating tier:', error);
    }
  };

  const handleToggleFeature = async (tierId, featureId, isEnabled) => {
    try {
      const res = await fetch(`/api/admin/pricing/tiers/${tierId}/features/${featureId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !isEnabled }),
      });
      if (res.ok) {
        await mutateFeatures();
      }
    } catch (error) {
      console.error('[v0] Error toggling feature:', error);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pricing Management</h1>
          <p className="text-muted-foreground mt-1">Configure pricing tiers and features</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Tier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Pricing Tier</DialogTitle>
              <DialogDescription>Add a new subscription tier</DialogDescription>
            </DialogHeader>
            <TierForm onSubmit={handleCreateTier} onClose={() => setIsDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Pricing Tiers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tiers?.data?.map((tier) => (
          <Card
            key={tier.id}
            className={`cursor-pointer transition-all ${selectedTier?.id === tier.id ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setSelectedTier(tier)}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{tier.name}</CardTitle>
                {!tier.is_active && <Badge variant="outline">Inactive</Badge>}
              </div>
              <CardDescription>{tier.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-3xl font-bold">
                  ${(tier.price_monthly / 100).toFixed(2)}
                </div>
                <p className="text-sm text-muted-foreground">per month</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Edit2 className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  <Settings className="w-4 h-4 mr-1" />
                  Features
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Features Configuration */}
      {selectedTier && (
        <Card>
          <CardHeader>
            <CardTitle>Features for {selectedTier.name}</CardTitle>
            <CardDescription>Enable or disable features for this tier</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {features?.data?.map((feature) => {
                const tierFeature = tierFeatures?.data?.find((tf) => tf.feature_id === feature.id);
                return (
                  <Card key={feature.id} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{feature.name}</h4>
                      <input
                        type="checkbox"
                        checked={tierFeature?.is_enabled || false}
                        onChange={() =>
                          handleToggleFeature(selectedTier.id, feature.id, tierFeature?.is_enabled)
                        }
                        className="w-5 h-5 rounded"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                    {tierFeature?.limit_value && (
                      <Badge variant="secondary" className="mt-2">
                        Limit: {tierFeature.limit_value}
                      </Badge>
                    )}
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TierForm({ onSubmit, onClose }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price_monthly: '',
    price_yearly: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      price_monthly: parseInt(formData.price_monthly) * 100,
      price_yearly: parseInt(formData.price_yearly) * 100,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Tier Name</label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Pro"
          required
        />
      </div>
      <div>
        <label className="text-sm font-medium">Description</label>
        <Input
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Brief description of the tier"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-sm font-medium">Monthly Price ($)</label>
          <Input
            type="number"
            value={formData.price_monthly}
            onChange={(e) => setFormData({ ...formData, price_monthly: e.target.value })}
            placeholder="29.99"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Yearly Price ($)</label>
          <Input
            type="number"
            value={formData.price_yearly}
            onChange={(e) => setFormData({ ...formData, price_yearly: e.target.value })}
            placeholder="299.99"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">
          Create Tier
        </Button>
        <Button type="button" variant="outline" onClick={onClose} className="flex-1">
          Cancel
        </Button>
      </div>
    </form>
  );
}
