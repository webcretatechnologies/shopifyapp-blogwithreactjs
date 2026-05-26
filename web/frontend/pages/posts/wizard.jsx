import { useState, useEffect, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  Button,
  Spinner,
  BlockStack,
  InlineStack,
  Modal,
  TextField,
  Banner,
  Grid,
  Select,
  FormLayout,
} from "@shopify/polaris";
import { useNavigate } from "react-router-dom";

export default function Wizard() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal active state & configurations
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [title, setTitle] = useState("");
  const [blogs, setBlogs] = useState([]);
  const [selectedBlog, setSelectedBlog] = useState("");
  const [author, setAuthor] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [featuredImage, setFeaturedImage] = useState("");
  const [image1, setImage1] = useState("");
  const [image2, setImage2] = useState("");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetchBlogs();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wizard/templates");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch templates");
      setTemplates(data.templates || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchBlogs = async () => {
    try {
      const res = await fetch("/api/import/blogs");
      if (res.ok) {
        const data = await res.json();
        setBlogs(data.blogs || []);
        if (data.blogs && data.blogs.length > 0) {
          setSelectedBlog(String(data.blogs[0].id));
        }
      }
    } catch (err) {
      console.error("Failed to load blogs:", err);
    }
  };

  const handleImageUpload = async (file, setUrlCallback) => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setUploading(true);
    try {
      const res = await fetch("/api/posts/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setUrlCallback(data.url);
    } catch (err) {
      setError("Image upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async () => {
    if (!title) return;
    setCreating(true);
    setError(null);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const res = await fetch("/api/wizard/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: activeTemplate.id,
          title,
          blog_id: selectedBlog,
          author,
          featured_image: featuredImage,
          image1,
          image2,
          tags,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create article");

      navigate(`/posts/${data.post_id}/edit`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
      setActiveTemplate(null);
    }
  };

  const blogOptions = blogs.map((b) => ({
    label: b.title,
    value: String(b.id),
  }));

  const getTemplateEmoji = (id) => {
    switch (id) {
      case "blank":
        return "📄";
      case "faq_product_sidebar":
        return "❓";
      case "story_two_images":
        return "📖";
      case "scroll_left_sidebar_products":
        return "📱";
      case "scroll_right_switcher_products":
        return "🔄";
      case "featured_here_sidebar":
        return "🏆";
      case "expert_review_pro":
        return "✍️";
      default:
        return "📝";
    }
  };

  const getTemplateGradient = (id) => {
    switch (id) {
      case "blank":
        return "linear-gradient(135deg, #f9fafb 0%, #f4f6f8 100%)";
      case "faq_product_sidebar":
        return "linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)";
      case "story_two_images":
        return "linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)";
      case "scroll_left_sidebar_products":
        return "linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)";
      case "scroll_right_switcher_products":
        return "linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)";
      case "featured_here_sidebar":
        return "linear-gradient(135deg, #efebe9 0%, #d7ccc8 100%)";
      case "expert_review_pro":
        return "linear-gradient(135deg, #e0f2f1 0%, #b2dfdb 100%)";
      default:
        return "linear-gradient(135deg, #f4f6f8 0%, #dfe3e8 100%)";
    }
  };

  return (
    <Page
      breadcrumbs={[
        { content: "Dashboard", onAction: () => navigate("/posts") },
      ]}
      title="Create with Template Wizard"
      subtitle="Select a pre-designed layout to jumpstart your content."
    >
      <BlockStack gap="400">
        {error && (
          <Banner
            title="Error"
            tone="critical"
            onDismiss={() => setError(null)}
          >
            {error}
          </Banner>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem" }}>
            <Spinner size="large" />
          </div>
        ) : (
          <Grid>
            {templates.map((tpl) => (
              <Grid.Cell
                key={tpl.id}
                columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}
              >
                <Card padding="400">
                  <BlockStack gap="400">
                    <div
                      style={{
                        height: "140px",
                        background: getTemplateGradient(tpl.id),
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "8px",
                        border: "1px solid #dfe3e8",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <span style={{ fontSize: "42px", marginBottom: "8px" }}>
                        {getTemplateEmoji(tpl.id)}
                      </span>
                      <Text
                        variant="bodySm"
                        tone="subdued"
                        style={{ color: "#5c5f62", fontWeight: "bold" }}
                      >
                        {tpl.id.toUpperCase().replace(/_/g, " ")}
                      </Text>
                    </div>
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text variant="headingMd" as="h3">
                          {tpl.name}
                        </Text>
                        {tpl.badge && <Badge tone="info">{tpl.badge}</Badge>}
                      </InlineStack>
                      <Button
                        fullWidth
                        onClick={() => {
                          setActiveTemplate(tpl);
                          setTitle("");
                          setAuthor("");
                          setTagsInput("");
                          setFeaturedImage("");
                          setImage1("");
                          setImage2("");
                        }}
                      >
                        Use Template
                      </Button>
                    </BlockStack>
                  </BlockStack>
                </Card>
              </Grid.Cell>
            ))}
          </Grid>
        )}

        {activeTemplate && (
          <Modal
            open={!!activeTemplate}
            onClose={() => setActiveTemplate(null)}
            title={`Create new: ${activeTemplate.name}`}
            primaryAction={{
              content: "Create Article",
              onAction: handleCreate,
              loading: creating,
              disabled: !title || uploading,
            }}
            secondaryActions={[
              {
                content: "Cancel",
                onAction: () => setActiveTemplate(null),
                disabled: creating,
              },
            ]}
          >
            <Modal.Section>
              <FormLayout>
                <TextField
                  label="Article Title"
                  value={title}
                  onChange={setTitle}
                  placeholder="e.g. 10 Tips for Perfect Espresso"
                  autoComplete="off"
                  autoFocus
                />

                {blogOptions.length > 0 && (
                  <Select
                    label="Select Shopify Blog"
                    options={blogOptions}
                    value={selectedBlog}
                    onChange={setSelectedBlog}
                    helpText="Assign this article to one of your active Shopify blogs"
                  />
                )}

                <Grid>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
                    <TextField
                      label="Author"
                      value={author}
                      onChange={setAuthor}
                      placeholder="e.g. Jane Doe"
                      autoComplete="off"
                    />
                  </Grid.Cell>
                  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
                    <TextField
                      label="Tags (comma separated)"
                      value={tagsInput}
                      onChange={setTagsInput}
                      placeholder="coffee, guide, recipe"
                      autoComplete="off"
                    />
                  </Grid.Cell>
                </Grid>

                <div style={{ marginTop: "12px" }}>
                  <Text variant="bodyMd" fontWeight="semibold">
                    Featured Image
                  </Text>
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      marginTop: "6px",
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      id="featured-image-upload"
                      style={{ display: "none" }}
                      onChange={(e) =>
                        handleImageUpload(e.target.files[0], setFeaturedImage)
                      }
                    />
                    <Button
                      onClick={() =>
                        document.getElementById("featured-image-upload").click()
                      }
                      disabled={uploading}
                    >
                      {uploading ? "Uploading..." : "Upload File"}
                    </Button>
                    <div style={{ flex: 1 }}>
                      <TextField
                        value={featuredImage}
                        onChange={setFeaturedImage}
                        placeholder="Or paste image URL"
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  {featuredImage && (
                    <div style={{ marginTop: "10px" }}>
                      <img
                        src={featuredImage}
                        alt="Featured Preview"
                        style={{ maxHeight: "80px", borderRadius: "4px" }}
                      />
                    </div>
                  )}
                </div>

                {activeTemplate.id === "story_two_images" && (
                  <div
                    style={{
                      marginTop: "16px",
                      borderTop: "1px solid #dfe3e8",
                      paddingTop: "16px",
                    }}
                  >
                    <Text variant="bodyMd" fontWeight="semibold">
                      Template-Specific Images
                    </Text>
                    <Grid>
                      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
                        <div style={{ marginTop: "8px" }}>
                          <Text variant="bodySm">Image 1</Text>
                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                              marginTop: "4px",
                              alignItems: "center",
                            }}
                          >
                            <input
                              type="file"
                              accept="image/*"
                              id="image1-upload"
                              style={{ display: "none" }}
                              onChange={(e) =>
                                handleImageUpload(e.target.files[0], setImage1)
                              }
                            />
                            <Button
                              onClick={() =>
                                document.getElementById("image1-upload").click()
                              }
                              disabled={uploading}
                            >
                              Upload
                            </Button>
                            <div style={{ flex: 1 }}>
                              <TextField
                                value={image1}
                                onChange={setImage1}
                                placeholder="URL"
                                autoComplete="off"
                              />
                            </div>
                          </div>
                          {image1 && (
                            <img
                              src={image1}
                              style={{
                                marginTop: "6px",
                                maxHeight: "50px",
                                borderRadius: "4px",
                              }}
                            />
                          )}
                        </div>
                      </Grid.Cell>
                      <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
                        <div style={{ marginTop: "8px" }}>
                          <Text variant="bodySm">Image 2</Text>
                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                              marginTop: "4px",
                              alignItems: "center",
                            }}
                          >
                            <input
                              type="file"
                              accept="image/*"
                              id="image2-upload"
                              style={{ display: "none" }}
                              onChange={(e) =>
                                handleImageUpload(e.target.files[0], setImage2)
                              }
                            />
                            <Button
                              onClick={() =>
                                document.getElementById("image2-upload").click()
                              }
                              disabled={uploading}
                            >
                              Upload
                            </Button>
                            <div style={{ flex: 1 }}>
                              <TextField
                                value={image2}
                                onChange={setImage2}
                                placeholder="URL"
                                autoComplete="off"
                              />
                            </div>
                          </div>
                          {image2 && (
                            <img
                              src={image2}
                              style={{
                                marginTop: "6px",
                                maxHeight: "50px",
                                borderRadius: "4px",
                              }}
                            />
                          )}
                        </div>
                      </Grid.Cell>
                    </Grid>
                  </div>
                )}
              </FormLayout>
            </Modal.Section>
          </Modal>
        )}
      </BlockStack>
    </Page>
  );
}
