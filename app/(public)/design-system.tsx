import { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { Avatar, Badge, Button, Card, Chip, Divider, Icon, Skeleton, Spinner, Switch } from "@/ui";
import { SearchBar, ListItem, EmptyState, SectionHeader } from "@/ui/molecules";

function SectionTitle({ children }: { children: string }) {
  return <Text className="text-foreground text-xl font-bold mt-4">{children}</Text>;
}

function Label({ children }: { children: string }) {
  return <Text className="text-muted text-sm">{children}</Text>;
}

function ColorSwatch({ name, className }: { name: string; className: string }) {
  return (
    <View className="items-center gap-1">
      <View className={`h-12 w-12 rounded-sm ${className}`} />
      <Text className="text-foreground text-xs">{name}</Text>
    </View>
  );
}

export default function TestScreen() {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="px-6 py-6 gap-6">
      <Text className="text-foreground text-3xl font-bold">Design System</Text>
      <Text className="text-muted text-base">Showcase & token reference</Text>
      {/* ─── Color Palette ─── */}
      <SectionTitle>Color Palette</SectionTitle>
      <Label>Electric Indigo — Primary</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          <ColorSwatch name="50" className="bg-electric-indigo-50" />
          <ColorSwatch name="100" className="bg-electric-indigo-100" />
          <ColorSwatch name="200" className="bg-electric-indigo-200" />
          <ColorSwatch name="300" className="bg-electric-indigo-300" />
          <ColorSwatch name="400" className="bg-electric-indigo-400" />
          <ColorSwatch name="500" className="bg-electric-indigo-500" />
          <ColorSwatch name="600" className="bg-electric-indigo-600" />
          <ColorSwatch name="700" className="bg-electric-indigo-700" />
          <ColorSwatch name="800" className="bg-electric-indigo-800" />
          <ColorSwatch name="900" className="bg-electric-indigo-900" />
          <ColorSwatch name="950" className="bg-electric-indigo-950" />
        </View>
      </ScrollView>
      <Label>Watermelon — Danger</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          <ColorSwatch name="50" className="bg-watermelon-50" />
          <ColorSwatch name="100" className="bg-watermelon-100" />
          <ColorSwatch name="200" className="bg-watermelon-200" />
          <ColorSwatch name="300" className="bg-watermelon-300" />
          <ColorSwatch name="400" className="bg-watermelon-400" />
          <ColorSwatch name="500" className="bg-watermelon-500" />
          <ColorSwatch name="600" className="bg-watermelon-600" />
          <ColorSwatch name="700" className="bg-watermelon-700" />
          <ColorSwatch name="800" className="bg-watermelon-800" />
          <ColorSwatch name="900" className="bg-watermelon-900" />
          <ColorSwatch name="950" className="bg-watermelon-950" />
        </View>
      </ScrollView>
      <Label>Golden Pollen — Warning</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          <ColorSwatch name="50" className="bg-golden-pollen-50" />
          <ColorSwatch name="100" className="bg-golden-pollen-100" />
          <ColorSwatch name="200" className="bg-golden-pollen-200" />
          <ColorSwatch name="300" className="bg-golden-pollen-300" />
          <ColorSwatch name="400" className="bg-golden-pollen-400" />
          <ColorSwatch name="500" className="bg-golden-pollen-500" />
          <ColorSwatch name="600" className="bg-golden-pollen-600" />
          <ColorSwatch name="700" className="bg-golden-pollen-700" />
          <ColorSwatch name="800" className="bg-golden-pollen-800" />
          <ColorSwatch name="900" className="bg-golden-pollen-900" />
          <ColorSwatch name="950" className="bg-golden-pollen-950" />
        </View>
      </ScrollView>
      <Label>Carbon Black — Neutrals</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          <ColorSwatch name="50" className="bg-carbon-black-50" />
          <ColorSwatch name="100" className="bg-carbon-black-100" />
          <ColorSwatch name="200" className="bg-carbon-black-200" />
          <ColorSwatch name="300" className="bg-carbon-black-300" />
          <ColorSwatch name="400" className="bg-carbon-black-400" />
          <ColorSwatch name="500" className="bg-carbon-black-500" />
          <ColorSwatch name="600" className="bg-carbon-black-600" />
          <ColorSwatch name="700" className="bg-carbon-black-700" />
          <ColorSwatch name="800" className="bg-carbon-black-800" />
          <ColorSwatch name="900" className="bg-carbon-black-900" />
          <ColorSwatch name="950" className="bg-carbon-black-950" />
        </View>
      </ScrollView>
      <Label>Jungle Green — Success</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          <ColorSwatch name="50" className="bg-jungle-green-50" />
          <ColorSwatch name="100" className="bg-jungle-green-100" />
          <ColorSwatch name="200" className="bg-jungle-green-200" />
          <ColorSwatch name="300" className="bg-jungle-green-300" />
          <ColorSwatch name="400" className="bg-jungle-green-400" />
          <ColorSwatch name="500" className="bg-jungle-green-500" />
          <ColorSwatch name="600" className="bg-jungle-green-600" />
          <ColorSwatch name="700" className="bg-jungle-green-700" />
          <ColorSwatch name="800" className="bg-jungle-green-800" />
          <ColorSwatch name="900" className="bg-jungle-green-900" />
          <ColorSwatch name="950" className="bg-jungle-green-950" />
        </View>
      </ScrollView>
      {/* ─── Semantic Tokens ─── */}
      <SectionTitle>Semantic Tokens</SectionTitle>
      <View className="flex-row gap-3 flex-wrap">
        <ColorSwatch name="primary" className="bg-primary" />
        <ColorSwatch name="danger" className="bg-danger" />
        <ColorSwatch name="success" className="bg-success" />
        <ColorSwatch name="warning" className="bg-warning" />
        <ColorSwatch name="accent" className="bg-accent" />
        <ColorSwatch name="muted" className="bg-muted" />
        <ColorSwatch name="card" className="bg-card border border-border" />
        <ColorSwatch name="border" className="bg-border" />
      </View>
      {/* ─── Typography ─── */}
      <SectionTitle>Typography</SectionTitle>
      <View className="gap-2">
        <Text className="text-foreground text-xs">text-xs (12px)</Text>
        <Text className="text-foreground text-sm">text-sm (14px)</Text>
        <Text className="text-foreground text-base">text-base (16px)</Text>
        <Text className="text-foreground text-lg">text-lg (18px)</Text>
        <Text className="text-foreground text-xl">text-xl (20px)</Text>
        <Text className="text-foreground text-2xl">text-2xl (24px)</Text>
        <Text className="text-foreground text-3xl">text-3xl (30px)</Text>
        <Text className="text-foreground text-4xl">text-4xl (36px)</Text>
      </View>
      {/* ─── Border Radius ─── */}
      <SectionTitle>Border Radius</SectionTitle>
      <View className="flex-row gap-4 flex-wrap">
        <View className="items-center gap-1">
          <View className="h-16 w-16 bg-primary rounded-xs" />
          <Text className="text-muted text-xs">xs (4)</Text>
        </View>
        <View className="items-center gap-1">
          <View className="h-16 w-16 bg-primary rounded-sm" />
          <Text className="text-muted text-xs">sm (8)</Text>
        </View>
        <View className="items-center gap-1">
          <View className="h-16 w-16 bg-primary rounded-md" />
          <Text className="text-muted text-xs">md (12)</Text>
        </View>
        <View className="items-center gap-1">
          <View className="h-16 w-16 bg-primary rounded-lg" />
          <Text className="text-muted text-xs">lg (14)</Text>
        </View>
        <View className="items-center gap-1">
          <View className="h-16 w-16 bg-primary rounded-xl" />
          <Text className="text-muted text-xs">xl (20)</Text>
        </View>
        <View className="items-center gap-1">
          <View className="h-16 w-16 bg-primary rounded-2xl" />
          <Text className="text-muted text-xs">2xl (24)</Text>
        </View>
        <View className="items-center gap-1">
          <View className="h-16 w-16 bg-primary rounded-full" />
          <Text className="text-muted text-xs">full</Text>
        </View>
      </View>
      {/* ─── Spacing ─── */}
      <SectionTitle>Spacing (base 4px)</SectionTitle>
      <View className="gap-1">
        {[
          ["1", "4px"],
          ["2", "8px"],
          ["3", "12px"],
          ["4", "16px"],
          ["6", "24px"],
          ["8", "32px"],
          ["10", "40px"],
          ["12", "48px"],
        ].map(([token, px]) => (
          <View key={token} className="flex-row items-center gap-3">
            <Text className="text-muted text-xs w-8">{token}</Text>
            <View className="h-3 bg-primary" style={{ width: Number.parseInt(px) }} />
            <Text className="text-foreground-secondary text-xs">{px}</Text>
          </View>
        ))}
      </View>
      <Divider />
      {/* ─── Icons (Lucide) ─── */}
      <SectionTitle>Icons (Lucide)</SectionTitle>
      <View className="flex-row gap-4 flex-wrap">
        <Icon name="House" size={24} />
        <Icon name="Wallet" size={24} themeColor="accent" />
        <Icon name="CreditCard" size={24} themeColor="danger" />
        <Icon name="TrendingUp" size={24} themeColor="success" />
        <Icon name="Bell" size={24} themeColor="warning" />
        <Icon name="Search" size={24} themeColor="muted" />
        <Icon name="Settings" size={24} />
        <Icon name="Plus" size={24} />
      </View>
      <Divider />
      {/* ─── Avatars ─── */}
      <SectionTitle>Avatars</SectionTitle>
      <View className="flex-row gap-4 items-center">
        <Avatar label="John Doe" size="sm" />
        <Avatar label="Jane Smith" size="md" />
        <Avatar label="Actual Budget" size="lg" />
      </View>
      {/* ─── Badges ─── */}
      <SectionTitle>Badges</SectionTitle>
      <View className="flex-row gap-2 flex-wrap">
        <Badge>Default</Badge>
        <Badge variant="primary">Primary</Badge>
        <Badge variant="danger">Danger</Badge>
        <Badge variant="success">Success</Badge>
        <Badge variant="warning">Warning</Badge>
      </View>
      <Divider />
      {/* ─── Buttons (HeroUI) ─── */}
      <SectionTitle>Buttons</SectionTitle>
      <View className="gap-3">
        <Button variant="primary" onPress={() => {}}>
          Primary
        </Button>
        <Button variant="secondary" onPress={() => {}}>
          Secondary
        </Button>
        <Button variant="danger" onPress={() => {}}>
          Danger
        </Button>
        <Button variant="ghost" onPress={() => {}}>
          Ghost
        </Button>
        <Button variant="outline" onPress={() => {}}>
          Outline
        </Button>
      </View>
      {/* ─── Cards (HeroUI) ─── */}
      <SectionTitle>Cards</SectionTitle>
      <Card>
        <Card.Header>
          <Text className="text-foreground font-semibold">Card Title</Text>
        </Card.Header>
        <Card.Body>
          <Card.Description>
            A card using HeroUI compound components with our design tokens.
          </Card.Description>
        </Card.Body>
      </Card>
      {/* ─── Switch ─── */}
      <SectionTitle>Switch</SectionTitle>
      <SwitchDemo />

      {/* ─── Spinner ─── */}
      <SectionTitle>Spinner</SectionTitle>
      <View className="flex-row gap-6 items-center">
        <Spinner themeColor="accent" />
        <Spinner themeColor="danger" />
        <Spinner themeColor="success" />
        <Spinner themeColor="muted" />
      </View>

      {/* ─── Chips ─── */}
      <SectionTitle>Chips</SectionTitle>
      <View className="flex-row gap-2 flex-wrap">
        <Chip>
          <Chip.Label>Food</Chip.Label>
        </Chip>
        <Chip>
          <Chip.Label>Transport</Chip.Label>
        </Chip>
        <Chip>
          <Chip.Label>Entertainment</Chip.Label>
        </Chip>
      </View>

      {/* ─── Skeleton ─── */}
      <SectionTitle>Skeleton</SectionTitle>
      <View className="gap-3">
        <Skeleton className="h-4 w-3/4 rounded-md" />
        <Skeleton className="h-4 w-1/2 rounded-md" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </View>

      {/* ─── Theme Adaptation ─── */}
      <SectionTitle>Theme Adaptation</SectionTitle>
      <View className="bg-surface rounded-xl p-4 border border-border gap-2">
        <Text className="text-foreground text-lg font-semibold">Light / Dark</Text>
        <Text className="text-muted text-sm">
          This card uses semantic tokens. Switch your device theme to see it adapt.
        </Text>
      </View>
      <Divider />

      {/* ─── Molecules ─── */}
      <Text className="text-foreground text-3xl font-bold mt-6">Molecules</Text>

      {/* SearchBar */}
      <SectionTitle>SearchBar</SectionTitle>
      <SearchBarDemo />

      {/* SectionHeader */}
      <SectionTitle>SectionHeader</SectionTitle>
      <SectionHeader title="Cuentas" action="Ver todas" onAction={() => {}} />
      <SectionHeader title="Transacciones recientes" />

      {/* ListItem */}
      <SectionTitle>ListItem</SectionTitle>
      <View className="bg-surface rounded-xl overflow-hidden">
        <ListItem
          icon={<Icon name="Wallet" themeColor="accent" />}
          title="Cuenta principal"
          subtitle="Banco Nacional"
          trailing={<Text className="text-foreground font-semibold">$1,234.56</Text>}
          showChevron
          onPress={() => {}}
        />
        <Divider />
        <ListItem
          icon={<Icon name="CreditCard" themeColor="danger" />}
          title="Tarjeta de crédito"
          subtitle="Visa ****4321"
          trailing={<Text className="text-danger font-semibold">-$456.78</Text>}
          showChevron
          onPress={() => {}}
        />
        <Divider />
        <ListItem
          icon={<Icon name="PiggyBank" themeColor="success" />}
          title="Ahorros"
          trailing={<Text className="text-success font-semibold">$8,901.23</Text>}
          showChevron
          onPress={() => {}}
        />
      </View>

      {/* EmptyState */}
      <SectionTitle>EmptyState</SectionTitle>
      <EmptyState
        icon="Wallet"
        title="No hay cuentas"
        description="Añade tu primera cuenta para empezar a organizar tus finanzas"
        actionLabel="Añadir cuenta"
        onAction={() => {}}
      />

      <View className="h-10" />
    </ScrollView>
  );
}

function SearchBarDemo() {
  const [search, setSearch] = useState("");
  return <SearchBar value={search} onChange={setSearch} placeholder="Buscar transacciones..." />;
}

function SwitchDemo() {
  const [enabled, setEnabled] = useState(false);
  return (
    <View className="flex-row items-center gap-3">
      <Switch isSelected={enabled} onSelectedChange={setEnabled} />
      <Text className="text-foreground text-base">{enabled ? "On" : "Off"}</Text>
    </View>
  );
}
