import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { TitleBar } from "@shopify/app-bridge-react";
import { smartBackAction } from "../../utils/smartBack";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  IndexFilters,
  IndexFiltersMode,
  Text,
  Button,
  EmptyState,
  Toast,
  Popover,
  ActionList,
  Frame,
  Modal,
} from "@shopify/polaris";
import { MenuHorizontalIcon, DeleteIcon } from "@shopify/polaris-icons";

function CategoryActionPopover({ onDelete }) {
  const [popoverActive, setPopoverActive] = useState(false);
  const togglePopoverActive = useCallback(() => setPopoverActive((active) => !active), []);

  return (
    <Popover
      active={popoverActive}
      activator={
        <Button
          variant="plain"
          icon={MenuHorizontalIcon}
          onClick={togglePopoverActive}
          accessibilityLabel="More actions"
        />
      }
      autofocusTarget="first-node"
      onClose={togglePopoverActive}
      preferredAlignment="right"
    >
      <ActionList
        actionRole="menuitem"
        items={[
          {
            content: "Delete",
            icon: DeleteIcon,
            destructive: true,
            onAction: () => {
              togglePopoverActive();
              onDelete();
            },
          },
        ]}
      />
    </Popover>
  );
}

export default function Categories() {
  const navigate = useNavigate();
  const location = useLocation();
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [itemStrings] = useState(["All"]);
  const [selected, setSelected] = useState(0);
  const [queryValue, setQueryValue] = useState("");
  const [sortSelected, setSortSelected] = useState(["name asc"]);
  const [mode, setMode] = useState(IndexFiltersMode.Default);

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/categories");
      const data = await res.json();
      let rows = data.categories || [];

      if (sortSelected.length > 0) {
        const [key, direction] = sortSelected[0].split(" ");
        rows.sort((a, b) => {
          if (key === "name") {
            return direction === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
          }
          if (key === "postCount") {
            return direction === "asc" ? a.postCount - b.postCount : b.postCount - a.postCount;
          }
          if (key === "updatedAt") {
            return direction === "asc"
              ? new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0)
              : new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
          }
          return 0;
        });
      }

      if (queryValue) {
        const q = queryValue.toLowerCase();
        rows = rows.filter(
          (c) => c.name.toLowerCase().includes(q) || String(c.slug || "").toLowerCase().includes(q)
        );
      }

      setCategories(rows);
    } catch {
      setToastMessage({ content: "Couldn't load categories", error: true });
    } finally {
      setIsLoading(false);
    }
  }, [queryValue, sortSelected]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    const incoming = location.state?.toast;
    if (!incoming?.content) return;
    setToastMessage(incoming);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location, navigate]);

  const confirmDelete = async () => {
    if (!deleteTarget || confirmName !== deleteTarget.name) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/categories/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't delete category");
      setToastMessage({ content: `Deleted “${deleteTarget.name}”` });
      setDeleteTarget(null);
      setConfirmName("");
      fetchCategories();
    } catch (err) {
      setToastMessage({ content: err.message, error: true });
    } finally {
      setIsDeleting(false);
    }
  };

  const sortOptions = [
    { label: "Name A–Z", value: "name asc", directionLabel: "A–Z" },
    { label: "Name Z–A", value: "name desc", directionLabel: "Z–A" },
    { label: "Most posts", value: "postCount desc", directionLabel: "Most" },
    { label: "Newest updated", value: "updatedAt desc", directionLabel: "Newest" },
  ];

  const rowMarkup = categories.map((category, index) => (
    <IndexTable.Row
      id={String(category.id)}
      key={category.id}
      position={index}
      onClick={() => navigate(`/categories/${category.id}/edit`)}
    >
      <IndexTable.Cell>
        <Text variant="bodyMd" fontWeight="semibold" as="span">
          {category.name}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodySm" tone="subdued">
          {category.slug}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodySm">{category.postCount}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text variant="bodySm" tone="subdued">
          {category.updatedAt ? new Date(category.updatedAt).toLocaleDateString() : "—"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div onClick={(e) => e.stopPropagation()}>
          <CategoryActionPopover onDelete={() => setDeleteTarget(category)} />
        </div>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Frame>
      <TitleBar title="Categories">
        <button variant="breadcrumb" onClick={() => navigate("/posts")}>
          Articles
        </button>
      </TitleBar>
      <Page
        title="Categories"
        backAction={smartBackAction(navigate, location, "/posts", "Articles")}
        primaryAction={{
          content: "Add category",
          onAction: () => navigate("/categories/new"),
        }}
      >
        <Layout>
          <Layout.Section>
            <Card padding="0">
              <IndexFilters
                sortOptions={sortOptions}
                sortSelected={sortSelected}
                queryValue={queryValue}
                queryPlaceholder="Search categories"
                onQueryChange={setQueryValue}
                onQueryClear={() => setQueryValue("")}
                onSort={setSortSelected}
                tabs={itemStrings.map((item, index) => ({
                  content: item,
                  index,
                  onAction: () => setSelected(index),
                  id: `${item}-${index}`,
                  isLocked: index === 0,
                }))}
                selected={selected}
                onSelect={setSelected}
                canCreateNewView={false}
                filters={[]}
                appliedFilters={[]}
                onClearAll={() => setQueryValue("")}
                mode={mode}
                setMode={setMode}
                hideFilters
              />
              <IndexTable
                resourceName={{ singular: "category", plural: "categories" }}
                itemCount={categories.length}
                selectedItemsCount={0}
                onSelectionChange={() => {}}
                selectable={false}
                headings={[
                  { title: "Name" },
                  { title: "Handle" },
                  { title: "Posts" },
                  { title: "Updated" },
                  { title: "", hidden: true },
                ]}
                loading={isLoading}
                emptyState={
                  !isLoading && (
                    <EmptyState
                      heading="Manage your categories"
                      action={{ content: "Add category", onAction: () => navigate("/categories/new") }}
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>
                        Categories group articles for related posts and the sidebar. Assign one
                        on each article after you create it.
                      </p>
                    </EmptyState>
                  )
                }
              >
                {rowMarkup}
              </IndexTable>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>

      <Modal
        open={!!deleteTarget}
        onClose={() => {
          setDeleteTarget(null);
          setConfirmName("");
        }}
        title={deleteTarget ? `Delete “${deleteTarget.name}”?` : "Delete category?"}
        primaryAction={{
          content: "Delete",
          destructive: true,
          onAction: confirmDelete,
          loading: isDeleting,
          disabled: confirmName !== deleteTarget?.name,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => {
              setDeleteTarget(null);
              setConfirmName("");
            },
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Posts keep their content but lose this category. Empty categories never appear in the
            sidebar.
          </Text>
          <div style={{ marginTop: 16 }}>
            <Text as="p" tone="subdued">
              To confirm deletion, type <b>{deleteTarget?.name}</b> below:
            </Text>
            <div style={{ marginTop: 8 }}>
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid var(--p-color-border)",
                  borderRadius: "4px",
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>
        </Modal.Section>
      </Modal>

      {toastMessage && (
        <Toast
          content={toastMessage.content}
          error={toastMessage.error}
          onDismiss={() => setToastMessage(null)}
        />
      )}
    </Frame>
  );
}
