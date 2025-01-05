# BETA: Directus Searchable M2M Interface

An enhanced Many-to-Many (M2M) interface for Directus that adds search capabilities. Basically an extended version of the existing M2M interface that allows for searching and creating new items through an input field.

## Features

- 🔍 Real-time search functionality for related items
- ✏️ Inline editing of related items through a drawer interface
- ➕ Create new related items on the fly
- 🏷️ Tag-like interface for managing relationships
- 🔄 Undo/redo deletion of relationships
- 📱 Responsive design with proper mobile support
- 🎨 Customizable display templates
- ⌨️ Keyboard navigation support
- 🔒 Respects Directus permissions system

## Bugs and improvements needed

- Probably unnecessary use of `watch` and `nextTick`
- Some unexpected behavior may occur
- Search fetches all of the items fields, we can reduce to only displayed fields

## Installation

```bash
npm install directus-extension-interface-searchable-m2m
# or
yarn add directus-extension-interface-searchable-m2m
```

## Configuration

When configuring the interface in Directus, you have access to the following options:

| Option | Description | Default |
|--------|-------------|---------|
| `template` | Display template for items using Directus template syntax | `\{\{field\}\}` |
| `filter` | Filter for the related collection | `null` |
| `allowCustom` | Allow creation of new items | `true` |
| `allowMultiple` | Allow multiple items to be selected | `false` |
| `placeholder` | Placeholder text for the search input | `Search items` |
| `sortField` | Field to sort results by | Primary Key |
| `sortDirection` | Direction to sort results (`asc` or `desc`) | `desc` |
| `iconLeft` | Icon to display on the left of the search input | `null` |
| `iconRight` | Icon to display on the right of the search input | `local_tag` |

## Usage

1. Create a Many-to-Many relationship in your Directus collection
2. Select "Searchable M2M Interface" as the interface for your M2M field
3. Configure the interface options as needed
4. Start managing your relationships with enhanced search and editing capabilities

### Template Syntax

The interface supports Directus's template syntax for displaying items. For example:

```
\{\{name\}\} - \{\{description\}\}
```

You can also include HTML fields that render images aswell.

## Keyboard Shortcuts

- `↑` / `↓` - Navigate through search results
- `Enter` - Select highlighted item or create new item
- `Tab` / `Shift+Tab` - Navigate through search results
- `Esc` - Close search dropdown or clear input

## Development

```bash
# Install dependencies
npm install

# Build the extension
npm run build

# Build the extension and watch for changes
npm run dev
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT License](LICENSE)