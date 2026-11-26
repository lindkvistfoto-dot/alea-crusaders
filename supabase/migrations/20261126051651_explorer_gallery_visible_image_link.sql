-- Resolve an image through its own visible link. Room links are additionally
-- restricted by the existing explored-location policy on campaign_image_links.
alter policy campaign_images_player_read on public.campaign_images using (
  private.is_campaign_member(campaign_id)
  and exists (
    select 1 from public.campaign_image_links link
    where link.image_id = campaign_images.id
      and link.campaign_id = campaign_images.campaign_id
      and link.player_visible
  )
);
