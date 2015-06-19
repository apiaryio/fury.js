/*
 * Renders refract elements into MSON.
 */

/*
 * Indent a piece of multiline text by a number of spaces.
 * Setting `first` to `true` will also indent the first line.
 */
function indent(input, spaces, options={first: false}) {
   let pre = '';
   let lines = [];

   for (let _ = 0; _ < spaces; _++) {
     pre += ' ';
   }

   for (let line of input.split('\n')) {
     // Only indent non-blank lines!
     lines.push(line ? pre + line : line);
   }

   lines = lines.join('\n').trim();

   if (options.first) {
     lines = pre + lines;
   }

   return lines;
 }

/*
 * Get type information for an element, such as the element name, whether
 * it is required, etc. Returns an array of strings.
 */
function getTypeAttributes(element, attributes={}) {
  let typeAttributes = [];

  if (element.element !== 'string' && element.element !== 'dataStructure') {
    typeAttributes.push(element.element);
  }

  return typeAttributes.concat(attributes.typeAttributes || []);
}

/*
 * Handle any element content, e.g. list items, object members, etc.
 * Note, this recursively calls the `handle` method.
 */
function handleContent(element, spaces, marker) {
  let renderedContent = '';
  let objectLike = null;

  if (element.content === undefined) {
    return [renderedContent, objectLike];
  }

  for (let item of element.content) {
    // Note: the `initialIndent` option above works because we specifically
    //       do *not* pass it down the rabbit hole here.
    if (item.element === 'member') {
      // This is an object type or something similar.
      objectLike = true;
      /* eslint-disable block-scoped-var */
      renderedContent += handle(item.key.content, item.value, {
        parent: element,
        spaces,
        marker,
        attributesElement: item
      });
      /* eslint-enable block-scoped-var */
    } else if (item.element === 'ref') {
      renderedContent += `${marker} Include ${item.content.href}\n`;
    } else if (item.element === 'select') {
      // This is a `OneOf` mutually exclusive type. Currently not
      // supported as it needs some support upstream in Minim.
      console.warn('MSON select/option elements are not yet supported!');
    } else {
      // This is an array type or something similar.
      objectLike = false;
      /* eslint-disable block-scoped-var */
      renderedContent += handle(item.meta.title.toValue(), item, {
        parent: element,
        spaces,
        marker
      });
      /* eslint-enable block-scoped-var */
    }
  }

  return [renderedContent, objectLike];
}

/*
 * Handle the description and any element content, including support
 * for both inline and long-form descriptions.
 */
function handleDescription(description, element, spaces, marker) {
  const elementName = element.element;
  let str = '';

  // This flag determines when to use a block description within a list entry
  // instead of just ending the list entry line with the description. This
  // means that some other special values like `+ Properties` will get used
  // later during rendering.
  let useLongDescription = false;
  if (element.attributes &&
      element.attributes.default !== undefined ||
      element.attributes.sample !== undefined) {
    useLongDescription = true;
  }

  // Finally, an optional description
  if (description) {
    if (description.indexOf('\n') !== -1) {
      // Multiline description, so we can't use the short form!
      useLongDescription = true;
    }

    if (useLongDescription) {
      str += `\n${description}`;
    } else {
      str += ` - ${description}`;
    }
  }

  // Handle special list items like default/sample here as they are part
  // of the description, before the content (sub-elements) are rendere.
  if (element.attributes.default !== undefined) {
    str += `\n${marker} Default: ${element.attributes.default}\n`;
  }

  if (element.attributes.sample !== undefined) {
    str += `\n${marker} Sample: ${element.attributes.sample}\n`;
  }

  // Now, depending on the content type, we will recursively handle child
  // elements within objects and arrays.
  if (element.content && element.content.length) {
    str += '\n';

    if (elementName === 'dataStructure') {
      str += '\n';
    }

    let [renderedContent, objectLike] = handleContent(element, spaces, marker);

    if (!useLongDescription) {
      str += renderedContent;
    } else if (renderedContent.length) {
      // There is rendered content
      if (objectLike) {
        str += `\n${marker} Properties\n`;
      } else if (elementName === 'enum') {
        // An enum is a special case where the content is a list
        // but you use `Members` rather than `Items`.
        str += `\n${marker} Members\n`;
      } else {
        str += `\n${marker} Items\n`;
      }

      str += indent(renderedContent, spaces, {first: true});
    }
  }

  return str;
}

/*
 * Handle the rendering of an element based on its element type. This function
 * will call itself recursively to handle child elements for objects and
 * arrays.
 */
function handle(name, element, {parent=null, spaces=4, marker='+',
                                initialMarker='+',
                                initialIndent=true,
                                attributesElement=element}) {
  let str = initialMarker;

  // Start with the item name if it has one.
  if (name) {
    str += ` ${name}`;
  }

  // Next, comes the optional example value
  if (typeof element.content !== 'object') {
    if (parent && parent.element !== 'array') {
      str += ':';
    }
    str += ` ${element.content}`;
  }

  // Then the type and attribute information (e.g. required)
  let attributes = getTypeAttributes(element, attributesElement.attributes);
  if (attributes.length) {
    str += ` (${attributes.join(', ')})`;
  }

  str += handleDescription(attributesElement.meta.description.toValue(),
                           element, spaces, marker);

  // Return the entire block indented to the correct number of spaces.
  if (initialIndent) {
    str = indent(str, spaces);
  }

  return str + '\n';
}

/*
 * Render out a piece of MSON from refract element instances.
 */
export default function render(mson) {
  // Render *either* ### Title or + Attributes as the base element to support
  // both a data structures section and resource / payload attributes.
  const title = mson.meta.title.toValue();

  return handle(title || 'Attributes', mson, {
    initialMarker: title ? '###' : '+',
    initialIndent: title ? false : true
  });
}