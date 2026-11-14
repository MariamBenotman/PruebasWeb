(function () {
  var h = window.h;
  var createClass = window.createClass;
  var stylesheet = new URL('./preview.css', window.location.href).toString();

  function getValue(entry, key, fallback) {
    return entry.getIn(['data', key]) || fallback;
  }

  function getImage(preview, value) {
    if (!value) return '';
    var asset = preview.props.getAsset(value);
    return asset ? asset.toString() : '';
  }

  function SiteHeader() {
    return h('header', { className: 'preview-header' },
      h('div', { className: 'preview-header-inner' },
        h('div', { className: 'preview-wordmark' }, 'RESET'),
        h('div', { className: 'preview-navigation' }, 'Noticias　 Cybertech　 Proyectos　 Talleres　 Servicios　 Calendario　 Conócenos')
      )
    );
  }

  function PageBanner(section, title, summary) {
    return h('header', { className: 'preview-banner' },
      h('p', { className: 'preview-eyebrow' }, section),
      h('h1', {}, title),
      summary ? h('p', { className: 'preview-summary' }, summary) : null
    );
  }

  function MembersPreview() {
    var entry = this.props.entry;
    var title = getValue(entry, 'title', 'Equipo de miembros');
    var year = getValue(entry, 'academicYear', '');
    var introduction = getValue(entry, 'introduction', '');
    var memberData = entry.getIn(['data', 'members']);
    var members = memberData && typeof memberData.toJS === 'function' ? memberData.toJS() : [];
    var cards = members.map(function (member, index) {
      var name = member.name || 'Nombre de integrante';
      var role = member.role || '';
      var photo = getImage(this, member.photo);
      var photoHover = getImage(this, member.photoHover);
      function setPhotoState(button, showAlternate) {
        var primary = button.querySelector('.member-photo-primary');
        var alternate = button.querySelector('.member-photo-alternate');
        if (primary) primary.style.opacity = showAlternate ? '0' : '1';
        if (alternate) {
          alternate.style.opacity = showAlternate ? '1' : '0';
          alternate.style.transform = showAlternate ? 'scale(1)' : 'scale(1.025)';
        }
      }
      return h('article', { className: 'member-card', key: index },
        h('button', {
          className: 'member-photo-toggle',
          type: 'button',
          'aria-label': 'Alternar fotos de ' + name,
          'aria-pressed': 'false',
          onMouseEnter: function (event) { setPhotoState(event.currentTarget, true); },
          onMouseLeave: function (event) { setPhotoState(event.currentTarget, event.currentTarget.getAttribute('aria-pressed') === 'true'); },
          onFocus: function (event) { setPhotoState(event.currentTarget, true); },
          onBlur: function (event) { setPhotoState(event.currentTarget, event.currentTarget.getAttribute('aria-pressed') === 'true'); },
          onClick: function (event) {
            var button = event.currentTarget;
            var alternate = button.getAttribute('aria-pressed') !== 'true';
            button.setAttribute('aria-pressed', alternate ? 'true' : 'false');
            setPhotoState(button, alternate);
          }
        },
          photo
            ? h('img', { className: 'member-photo-primary', src: photo, alt: name })
            : h('span', { className: 'member-photo-placeholder', 'aria-hidden': 'true' }, name),
          photoHover ? h('img', { className: 'member-photo-alternate', src: photoHover, alt: '', 'aria-hidden': 'true', loading: 'eager' }) : null
        ),
        h('div', { className: 'member-info' },
          h('h2', {}, name),
          role ? h('p', { className: 'member-role' }, role) : null
        )
      );
    }.bind(this));

    return h('div', { className: 'preview-site' },
      SiteHeader(),
      h('main', { className: 'preview-main' },
        PageBanner('Conócenos', title, year),
        introduction ? h('p', { className: 'preview-introduction' }, introduction) : null,
        h('section', { className: 'member-grid' }, cards.length ? cards : h('p', { className: 'preview-empty' }, 'Añade integrantes para ver el equipo aquí.'))
      ),
      h('footer', { className: 'preview-footer' }, 'Asociación de Estudiantes RESET · ETSII UPM')
    );
  }

  function NewsPreview() {
    var entry = this.props.entry;
    var title = getValue(entry, 'title', 'Título de la noticia');
    var category = getValue(entry, 'category', 'Noticias');
    var summary = getValue(entry, 'summary', 'El resumen de la noticia aparecerá aquí.');
    var pubDate = getValue(entry, 'pubDate', '');
    var image = getImage(this, getValue(entry, 'image', ''));
    return h('div', { className: 'preview-site' },
      SiteHeader(),
      h('main', { className: 'preview-main' },
        PageBanner(category, title, summary),
        h('article', { className: 'preview-article' },
          pubDate ? h('p', { className: 'preview-date' }, String(pubDate)) : null,
          image ? h('img', { className: 'preview-feature-image', src: image, alt: '' }) : null,
          h('div', { className: 'preview-body' }, this.props.widgetFor('body'))
        )
      ),
      h('footer', { className: 'preview-footer' }, 'Asociación de Estudiantes RESET · ETSII UPM')
    );
  }

  function CybertechPreview() {
    var entry = this.props.entry;
    var title = getValue(entry, 'title', 'Cybertech');
    var year = getValue(entry, 'year', '');
    var eventDate = getValue(entry, 'eventDate', '');
    var summary = getValue(entry, 'summary', 'Resumen de esta edición.');
    var image = getImage(this, getValue(entry, 'image', ''));
    return h('div', { className: 'preview-site' },
      SiteHeader(),
      h('main', { className: 'preview-main' },
        PageBanner('Competición de robótica · ' + year, title, summary),
        h('article', { className: 'preview-article' },
          eventDate ? h('p', { className: 'preview-date' }, eventDate + ' · ETSII-UPM') : null,
          image ? h('img', { className: 'preview-feature-image', src: image, alt: '' }) : null,
          h('div', { className: 'preview-body' }, this.props.widgetFor('body'))
        )
      ),
      h('footer', { className: 'preview-footer' }, 'Asociación de Estudiantes RESET · ETSII UPM')
    );
  }

  CMS.registerPreviewStyle(stylesheet);
  CMS.registerPreviewTemplate('noticias', createClass({ render: NewsPreview }));
  CMS.registerPreviewTemplate('miembros', createClass({ render: MembersPreview }));
  CMS.registerPreviewTemplate('cybertech', createClass({ render: CybertechPreview }));
})();