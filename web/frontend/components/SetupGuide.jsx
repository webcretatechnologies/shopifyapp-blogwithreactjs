import { useState, useEffect } from "react";
import { Card, Box, Text, BlockStack, InlineStack, ProgressBar, Button, Icon } from "@shopify/polaris";
import { CheckCircleIcon, XIcon } from "@shopify/polaris-icons";
import { useNavigate } from "react-router-dom";

export default function SetupGuide({ shop, isExtensionActive, hasPosts }) {
  const navigate = useNavigate();
  const [isDismissed, setIsDismissed] = useState(true); // default true to prevent flicker before useEffect runs

  useEffect(() => {
    setIsDismissed(localStorage.getItem('blogger_setup_dismissed') === '1');
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('blogger_setup_dismissed', '1');
    setIsDismissed(true);
  };
  
  const steps = [
    {
      id: 1,
      title: "Activate Blogger Analytics on your storefront",
      description: "Enable the Blog Analytics Tracker App Embed in your Theme Editor to start collecting live visitor data.",
      actionLabel: "Enable tracking",
      action: () => {
        window.open(`https://${shop}/admin/themes/current/editor?context=apps`, '_blank');
      },
      isCompleted: isExtensionActive
    },
    {
      id: 2,
      title: "Create your first blog post",
      description: "Write and publish your first article to start engaging with your customers.",
      actionLabel: "Create post",
      action: () => {
        navigate("/posts/new");
      },
      isCompleted: hasPosts
    }
  ];

  const completedSteps = steps.filter(s => s.isCompleted).length;
  const progress = (completedSteps / steps.length) * 100;

  if (isDismissed) return null;

  return (
    <BlockStack gap="400">
      <Text variant="headingLg" as="h2">Get started with Blogger React!</Text>
      <Card>
        <Box padding="400">
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h3">Setup guide</Text>
              <InlineStack gap="300" blockAlign="center">
                <Text variant="bodySm" tone="subdued">{completedSteps} of {steps.length} tasks complete</Text>
                <Button variant="plain" icon={XIcon} onClick={handleDismiss} accessibilityLabel="Dismiss setup guide" />
              </InlineStack>
            </InlineStack>
            <ProgressBar progress={progress} size="small" tone="primary" />
            
            <BlockStack gap="300">
              {steps.map((step, index) => {
                 const isActive = !step.isCompleted && (index === 0 || steps[index - 1].isCompleted);
                 const isPast = step.isCompleted;
                 
                 return (
                   <div key={step.id} style={{ 
                     border: isActive ? '1px solid #c9cccf' : '1px solid #e1e3e5',
                     boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                     borderRadius: '8px', 
                     padding: '16px',
                     background: isPast ? '#fafbfb' : '#ffffff',
                     transition: 'all 0.2s ease-in-out'
                   }}>
                     <InlineStack align="start" gap="300" wrap={false}>
                       <div style={{ marginTop: '2px', flexShrink: 0 }}>
                         {isPast ? (
                           <Icon source={CheckCircleIcon} tone="success" />
                         ) : (
                           <div style={{
                             width: '24px',
                             height: '24px',
                             borderRadius: '50%',
                             background: isActive ? '#202223' : '#e1e3e5',
                             color: isActive ? '#fff' : '#8c9196',
                             display: 'flex',
                             alignItems: 'center',
                             justifyContent: 'center',
                             fontSize: '12px',
                             fontWeight: 'bold'
                           }}>
                             {step.id}
                           </div>
                         )}
                       </div>
                       
                       <BlockStack gap="200">
                         <Text variant="headingSm" as="h4" fontWeight={isActive ? "bold" : "medium"}>{step.title}</Text>
                         {isActive && (
                           <BlockStack gap="300">
                             <Text variant="bodyMd" tone="subdued">{step.description}</Text>
                             <div>
                               <Button variant="primary" onClick={step.action}>
                                 {step.actionLabel}
                               </Button>
                             </div>
                           </BlockStack>
                         )}
                       </BlockStack>
                     </InlineStack>
                   </div>
                 );
              })}
            </BlockStack>
          </BlockStack>
        </Box>
      </Card>
    </BlockStack>
  );
}
