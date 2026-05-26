import { useMemo, useState } from 'react';
import { Badge, Button, Empty, List, Tag, Typography } from 'antd';
import { BellOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { useNotificationLog } from '../context/NotificationLogContext';
import { kindColor, kindLabel } from '../utils/notificationLogUtils';
import NotificationDetailModal from './NotificationDetailModal';

const { Text } = Typography;

interface NotificationLogPanelProps {
  visible: boolean;
}

export default function NotificationLogPanel({ visible }: NotificationLogPanelProps) {
  const { entries, openDetail, selectedEntry, closeDetail, clearLog } = useNotificationLog();
  const [expanded, setExpanded] = useState(true);

  const unreadCount = entries.length;

  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.timestamp - a.timestamp),
    [entries],
  );

  if (!visible || unreadCount === 0) return (
    <NotificationDetailModal
      entry={selectedEntry}
      open={selectedEntry != null}
      onClose={closeDetail}
    />
  );

  return (
    <>
      <div className={`notification-log${expanded ? ' notification-log--expanded' : ''}`}>
        <div className="notification-log__head">
          <Button
            type="text"
            size="small"
            icon={expanded ? <DownOutlined /> : <UpOutlined />}
            onClick={() => setExpanded((v) => !v)}
            style={{ padding: '0 4px' }}
          />
          <Badge count={unreadCount} size="small" offset={[4, 0]}>
            <BellOutlined style={{ fontSize: 14, color: '#1677ff' }} />
          </Badge>
          <Text strong style={{ fontSize: 13, marginLeft: 6 }}>
            Журнал уведомлений
          </Text>
          <Button
            type="link"
            size="small"
            onClick={clearLog}
            style={{ marginLeft: 'auto', fontSize: 11, padding: 0 }}
          >
            Очистить
          </Button>
        </div>

        {expanded && (
          <List
            className="notification-log__list"
            size="small"
            dataSource={sorted}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Пока пусто" /> }}
            renderItem={(item) => (
              <List.Item
                className="notification-log__item"
                onClick={() => openDetail(item)}
                style={{ cursor: 'pointer', padding: '6px 8px' }}
              >
                <div style={{ width: '100%', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Tag
                      color={kindColor(item.kind)}
                      style={{ margin: 0, fontSize: 10, lineHeight: '18px', padding: '0 5px' }}
                    >
                      {kindLabel(item.kind)}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 10 }}>
                      {new Date(item.timestamp).toLocaleTimeString('ru-RU')}
                    </Text>
                  </div>
                  <Text ellipsis style={{ fontSize: 12, display: 'block' }}>
                    {item.title}
                  </Text>
                </div>
              </List.Item>
            )}
          />
        )}
      </div>

      <NotificationDetailModal
        entry={selectedEntry}
        open={selectedEntry != null}
        onClose={closeDetail}
      />
    </>
  );
}
