/**
 * BuilderToolbar — Left sidebar listing all available block types.
 *
 * Now fully registry-driven for core blocks.
 * Only Shopify Commerce blocks (product, product_slider, etc.) remain
 * in the legacy static section because they haven't been migrated yet.
 */
import { useState } from 'react';
import { Text, TextField } from '@shopify/polaris';
import {
  getBlocksByCategory,
  searchBlocks,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
} from './registry/componentRegistry';

// ── Legacy blocks not yet in registry (Phase 4 migration) ────────────────────
const LEGACY_BLOCKS = [
  { type: 'product',          icon: '🏷',  label: 'Product Card (legacy)' },
  { type: 'product_sidebar',  icon: '📌',  label: 'Sticky Product (legacy)' },
  { type: 'product_switcher', icon: '🔄',  label: 'Product Switcher (legacy)' },
  { type: 'featured_product', icon: '⭐',  label: 'Featured Product (legacy)' },
  { type: 'product_slider',   icon: '↔',   label: 'Product Slider (legacy)' },
  { type: 'html',             icon: '</>', label: 'Custom HTML' },
];

export default function BuilderToolbar({ onAddBlock }) {
  const [search, setSearch] = useState('');

  const registryGroups = getBlocksByCategory();
  const isSearching = search.trim().length > 0;
  const searchResults = isSearching ? searchBlocks(search.trim()) : null;

  return (
    <div style={{
      width: '190px',
      flexShrink: 0,
      borderRight: '1px solid #e1e3e5',
      background: '#fff',
      padding: '12px 8px',
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '0',
    }}>
      {/* Header */}
      <div style={{ padding: '0 4px 8px' }}>
        <Text variant="headingSm">Blocks</Text>
        <Text variant="bodySm" tone="subdued">Click to add to canvas</Text>
      </div>

      {/* Search */}
      <div style={{ padding: '0 2px 8px' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search blocks..."
          style={{
            width: '100%',
            padding: '6px 10px',
            border: '1px solid #c9cccf',
            borderRadius: '6px',
            fontSize: '12px',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
      </div>

      {/* Search results */}
      {isSearching ? (
        <div>
          <div style={{ padding: '4px 4px 4px', marginBottom: '4px' }}>
            <Text variant="bodySm" tone="subdued" fontWeight="semibold">
              RESULTS ({searchResults.length})
            </Text>
          </div>
          {searchResults.length === 0 ? (
            <div style={{ padding: '12px 4px', fontSize: '12px', color: '#8c9196', textAlign: 'center' }}>
              No blocks found
            </div>
          ) : (
            searchResults.map(block => (
              <BlockTypeButton
                key={block.type}
                type={block.type}
                icon={block.icon}
                label={block.label}
                onAdd={onAddBlock}
              />
            ))
          )}
        </div>
      ) : (
        <>
          {/* Registry groups — ordered by CATEGORY_ORDER */}
          {CATEGORY_ORDER
            .filter(cat => registryGroups[cat]?.length > 0)
            .map(category => (
              <BlockGroup
                key={category}
                label={CATEGORY_LABELS[category] || category}
                blocks={registryGroups[category]}
                onAddBlock={onAddBlock}
              />
            ))
          }

          {/* Legacy blocks — older formats not yet migrated */}
          {LEGACY_BLOCKS.length > 0 && (
            <BlockGroup
              label="Legacy"
              blocks={LEGACY_BLOCKS}
              onAddBlock={onAddBlock}
              badge="LEGACY"
              badgeColor="#6d7175"
              badgeBg="#f1f2f3"
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BlockGroup({ label, blocks, onAddBlock, badge, badgeColor = '#008060', badgeBg = '#e6f5f0' }) {
  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ padding: '4px 4px 4px', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Text variant="bodySm" tone="subdued" fontWeight="semibold">
          {label.toUpperCase()}
        </Text>
        {badge && (
          <span style={{
            fontSize: '9px',
            background: badgeBg,
            color: badgeColor,
            padding: '1px 5px',
            borderRadius: '10px',
            fontWeight: '700',
            letterSpacing: '0.02em',
          }}>
            {badge}
          </span>
        )}
      </div>
      {blocks.map(block => (
        <BlockTypeButton
          key={block.type}
          type={block.type}
          icon={block.icon}
          label={block.label}
          onAdd={onAddBlock}
        />
      ))}
    </div>
  );
}

function BlockTypeButton({ type, icon, label, onAdd }) {
  return (
    <button
      type="button"
      onClick={() => onAdd(type)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        padding: '7px 8px',
        marginBottom: '1px',
        border: '1px solid transparent',
        borderRadius: '6px',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: '13px',
        color: '#202223',
        textAlign: 'left',
        transition: 'all 0.12s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = '#f1f2f3';
        e.currentTarget.style.borderColor = '#e1e3e5';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = 'transparent';
      }}
    >
      <span style={{
        width: 28, height: 28, borderRadius: '5px',
        background: '#f1f2f3',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '13px', fontWeight: '700', color: '#6d7175', flexShrink: 0,
      }}>
        {icon}
      </span>
      <span style={{ lineHeight: 1.3 }}>{label}</span>
    </button>
  );
}
