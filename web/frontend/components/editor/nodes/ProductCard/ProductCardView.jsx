import React, { useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { Modal, FormLayout, TextField, Select, Checkbox, Button } from '@shopify/polaris';

export default function ProductCardView({ node, updateAttributes, deleteNode }) {
  const [isEditing, setIsEditing] = useState(false);
  const attrs = node.attrs;

  const handleUpdate = (key, value) => {
    updateAttributes({ [key]: value });
  };

  const pickProduct = async () => {
    if (!window.shopify?.resourcePicker) return;
    const selection = await window.shopify.resourcePicker({ type: 'product', multiple: false });
    const product = selection?.[0];
    if (!product) return;
    const variant = product.variants?.[0];
    updateAttributes({
      productId: product.id || '',
      title: product.title || '',
      handle: product.handle || '',
      imageUrl: product.images?.[0]?.originalSrc || product.images?.[0]?.src || '',
      price: variant?.price ? `$${variant.price}` : '',
      compareAtPrice: variant?.compareAtPrice ? `$${variant.compareAtPrice}` : '',
    });
  };

  const layoutOptions = [
    { label: 'Vertical', value: 'vertical' },
    { label: 'Horizontal', value: 'horizontal' },
    { label: 'Compact', value: 'compact' },
  ];

  return (
    <NodeViewWrapper
      className="tiptap-product-card tiptap-block"
      style={{
        position: 'relative',
        margin: '1rem 0',
        borderRadius: `${attrs.borderRadius}px`,
        border: `1px solid ${attrs.borderColor}`,
        backgroundColor: attrs.backgroundColor,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: attrs.layout === 'horizontal' ? 'row' : 'column',
        alignItems: attrs.layout === 'compact' ? 'center' : 'stretch',
        padding: attrs.layout === 'compact' ? '12px' : '0'
      }}
    >
      <div
        className="product-card-toolbar tiptap-block-toolbar"
        contentEditable={false}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          display: 'flex',
          gap: '4px',
          zIndex: 10
        }}
      >
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          style={{ padding: '4px 8px', background: 'white', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer' }}
        >
          ✎ Edit
        </button>
        <button
          type="button"
          onClick={() => deleteNode()}
          style={{ padding: '4px 8px', background: 'white', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', color: 'red' }}
        >
          ×
        </button>
      </div>

      {attrs.showImage && attrs.layout !== 'compact' && (
        <div 
          style={{ 
            width: attrs.layout === 'horizontal' ? '30%' : '100%', 
            minHeight: '150px',
            background: attrs.imageUrl ? `url(${attrs.imageUrl}) center/cover` : '#f4f6f8',
            borderRight: attrs.layout === 'horizontal' ? `1px solid ${attrs.borderColor}` : 'none',
            borderBottom: attrs.layout === 'vertical' ? `1px solid ${attrs.borderColor}` : 'none'
          }}
        />
      )}
      
      <div style={{ 
        flex: 1, 
        padding: attrs.layout === 'compact' ? '0 12px' : '16px',
        display: attrs.layout === 'compact' ? 'flex' : 'block',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%'
      }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600' }}>
            {attrs.title || 'Select a product...'}
          </h3>
          {attrs.showPrice && (
            <div style={{ marginBottom: attrs.layout === 'compact' ? '0' : '16px' }}>
              <span style={{ fontWeight: 'bold' }}>{attrs.price || '$0.00'}</span>
              {attrs.compareAtPrice && (
                <span style={{ textDecoration: 'line-through', color: '#6d7175', marginLeft: '8px', fontSize: '14px' }}>
                  {attrs.compareAtPrice}
                </span>
              )}
            </div>
          )}
        </div>
        
        {attrs.showButton && (
          <button style={{
            background: attrs.buttonColor,
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '600',
            width: attrs.layout === 'vertical' ? '100%' : 'auto',
            marginLeft: attrs.layout === 'compact' ? '16px' : '0'
          }}>
            {attrs.buttonText}
          </button>
        )}
      </div>

      {isEditing && (
        <Modal
          open={isEditing}
          onClose={() => setIsEditing(false)}
          title="Edit Product Card"
          primaryAction={{
            content: 'Done',
            onAction: () => setIsEditing(false),
          }}
        >
          <Modal.Section>
            <FormLayout>
              <div style={{ border: '1px solid #ddd', padding: '12px', borderRadius: '4px', background: '#f9f9f9' }}>
                <p style={{ marginTop: 0 }}>
                  {attrs.title
                    ? <>Selected product: <strong>{attrs.title}</strong></>
                    : 'No product selected yet.'}
                </p>
                <Button onClick={pickProduct}>
                  {attrs.title ? 'Change Product' : 'Select Product'}
                </Button>
              </div>

              <Select
                label="Layout"
                options={layoutOptions}
                value={attrs.layout}
                onChange={(val) => handleUpdate('layout', val)}
              />
              
              <TextField
                label="Button Text"
                value={attrs.buttonText}
                onChange={(val) => handleUpdate('buttonText', val)}
                autoComplete="off"
              />
              
              <TextField
                label="Button Color"
                type="color"
                value={attrs.buttonColor}
                onChange={(val) => handleUpdate('buttonColor', val)}
                autoComplete="off"
              />

              <FormLayout.Group>
                <Checkbox
                  label="Show Image"
                  checked={attrs.showImage}
                  onChange={(val) => handleUpdate('showImage', val)}
                />
                <Checkbox
                  label="Show Price"
                  checked={attrs.showPrice}
                  onChange={(val) => handleUpdate('showPrice', val)}
                />
                <Checkbox
                  label="Show Button"
                  checked={attrs.showButton}
                  onChange={(val) => handleUpdate('showButton', val)}
                />
              </FormLayout.Group>
              
              <FormLayout.Group>
                <TextField
                  label="Border Radius"
                  type="number"
                  value={attrs.borderRadius.toString()}
                  onChange={(val) => handleUpdate('borderRadius', parseInt(val) || 0)}
                  autoComplete="off"
                />
                <TextField
                  label="Border Color"
                  type="color"
                  value={attrs.borderColor}
                  onChange={(val) => handleUpdate('borderColor', val)}
                  autoComplete="off"
                />
              </FormLayout.Group>
            </FormLayout>
          </Modal.Section>
        </Modal>
      )}
    </NodeViewWrapper>
  );
}
